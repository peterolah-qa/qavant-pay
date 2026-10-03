// POST /api/transfers
// Headers: Idempotency-Key: <8–64 chars [A-Za-z0-9_-]>
// Body:    { "recipientName": "Jana Nováková", "iban": "SK64…", "amountCents": 1000, "note": "Rent" }
//
// 201 → { transaction, balanceCents }
// Same Idempotency-Key + same body → the ORIGINAL 201 is replayed (header Idempotent-Replayed: true),
//   so a double click, a network retry or a resent request never pays twice.
// Same key + different body → 422 IDEMPOTENCY_KEY_REUSED.
import { executeTransfer, type TransferErrorCode, type TransferInput } from '@qavant-pay/core'
import { pinRequired, sessionExpired, unauthenticated } from '../lib/auth.ts'
import { error, methodNotAllowed } from '../lib/http.ts'
import { isExpired, readSessionId } from '../lib/session.ts'
import { WriteConflictError, sandboxRepo } from '../lib/store.ts'

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,64}$/

const MESSAGES: Record<TransferErrorCode, string> = {
  INVALID_RECIPIENT: 'Recipient name must be 2–70 characters',
  INVALID_IBAN: 'IBAN is not a valid Slovak IBAN',
  INVALID_AMOUNT: 'Amount must be a whole number of cents between 1 and 100000000',
  INVALID_NOTE: 'Note must be at most 140 characters',
  SAME_ACCOUNT: 'You cannot send money to your own account',
  INSUFFICIENT_FUNDS: 'Amount exceeds your available balance',
  DAILY_LIMIT_EXCEEDED: 'Amount exceeds your remaining daily limit of €2,000',
}

/** Rejects wrong JSON types (400). Business rules are checked later by core (422). */
function parseInput(body: unknown): TransferInput | null {
  if (typeof body !== 'object' || body === null) return null
  const { recipientName, iban, amountCents, note } = body as Record<string, unknown>
  if (typeof recipientName !== 'string' || typeof iban !== 'string' || typeof amountCents !== 'number') return null
  if (note !== undefined && typeof note !== 'string') return null
  return { recipientName, iban, amountCents, ...(note !== undefined ? { note } : {}) }
}

type Outcome =
  | { kind: 'expired' | 'pin' }
  | { kind: 'reused' }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'rejected'; code: TransferErrorCode; maxAllowedCents?: number }
  | { kind: 'created'; body: unknown }

export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST')

  const id = readSessionId(req.headers.get('cookie'))
  if (!id) return unauthenticated()

  const key = req.headers.get('idempotency-key')
  if (!key || !IDEMPOTENCY_KEY.test(key)) {
    return error(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send a unique Idempotency-Key header (8–64 chars) with every transfer')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return error(400, 'INVALID_JSON', 'Request body must be valid JSON')
  }
  const input = parseInput(body)
  if (!input) {
    return error(400, 'INVALID_REQUEST', 'Body must be {recipientName: string, iban: string, amountCents: number, note?: string}')
  }
  const fingerprint = JSON.stringify([input.recipientName, input.iban, input.amountCents, input.note ?? ''])

  const now = new Date()
  let outcome
  try {
    outcome = await sandboxRepo().update<Outcome>(id, (sandbox) => {
      if (isExpired(sandbox.createdAt, now)) return { result: { kind: 'expired' }, changed: false }
      if (!sandbox.authenticated) return { result: { kind: 'pin' }, changed: false }

      const previous = sandbox.idempotency?.[key]
      if (previous) {
        return previous.fingerprint === fingerprint
          ? { result: { kind: 'replay', status: previous.status, body: previous.body }, changed: false }
          : { result: { kind: 'reused' }, changed: false }
      }

      const result = executeTransfer(sandbox, input, now)
      if (!result.ok) {
        return { result: { kind: 'rejected', code: result.code, maxAllowedCents: result.maxAllowedCents }, changed: false }
      }

      const responseBody = { transaction: result.transaction, balanceCents: result.account.balanceCents }
      sandbox.account = result.account
      sandbox.transactions = result.transactions
      sandbox.idempotency = { ...sandbox.idempotency, [key]: { fingerprint, status: 201, body: responseBody } }
      return { result: { kind: 'created', body: responseBody }, changed: true }
    })
  } catch (e) {
    if (e instanceof WriteConflictError) return error(409, 'CONFLICT', 'Too many parallel requests, try again')
    throw e
  }

  if (!outcome.found) return sessionExpired()
  const result = outcome.result
  switch (result.kind) {
    case 'expired':
      return sessionExpired()
    case 'pin':
      return pinRequired()
    case 'reused':
      return error(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different transfer')
    case 'replay':
      return Response.json(result.body, { status: result.status, headers: { 'Idempotent-Replayed': 'true' } })
    case 'rejected':
      return Response.json(
        {
          code: result.code,
          message: MESSAGES[result.code],
          ...(result.maxAllowedCents !== undefined ? { maxAllowedCents: result.maxAllowedCents } : {}),
        },
        { status: 422 },
      )
    case 'created':
      return Response.json(result.body, { status: 201 })
  }
}
