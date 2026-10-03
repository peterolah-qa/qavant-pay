// POST /api/auth/pin  { "pin": "1234" }
// The lockout state lives on the SERVER (in the sandbox), so it cannot be bypassed by reloading
// the page. The read-check-write runs under optimistic locking, so firing many guesses in
// PARALLEL cannot slip past the 3-attempt limit either.
import { DEMO_PIN, attemptPin, type PinAttempt } from '@qavant-pay/core'
import { sessionExpired, unauthenticated } from '../lib/auth.ts'
import { error, json, methodNotAllowed } from '../lib/http.ts'
import { isExpired, readSessionId } from '../lib/session.ts'
import { WriteConflictError, sandboxRepo } from '../lib/store.ts'

export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST')

  const id = readSessionId(req.headers.get('cookie'))
  if (!id) return unauthenticated()

  let pin: unknown
  try {
    pin = ((await req.json()) as { pin?: unknown } | null)?.pin
  } catch {
    return error(400, 'INVALID_JSON', 'Request body must be valid JSON')
  }
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return error(400, 'INVALID_REQUEST', 'Body must be {"pin": "<4 digits>"}')
  }

  const now = new Date()
  let outcome
  try {
    outcome = await sandboxRepo().update<PinAttempt | 'EXPIRED'>(id, (sandbox) => {
      if (isExpired(sandbox.createdAt, now)) return { result: 'EXPIRED', changed: false }
      const attempt = attemptPin(sandbox.pin, pin, DEMO_PIN, now.getTime())
      sandbox.pin = attempt.state
      if (attempt.result === 'OK') sandbox.authenticated = true
      return { result: attempt, changed: true }
    })
  } catch (e) {
    if (e instanceof WriteConflictError) return error(409, 'CONFLICT', 'Too many parallel requests, try again')
    throw e
  }

  if (!outcome.found || outcome.result === 'EXPIRED') return sessionExpired()

  const attempt = outcome.result
  switch (attempt.result) {
    case 'OK':
      return json({ authenticated: true })
    case 'WRONG':
      return Response.json(
        { code: 'WRONG_PIN', message: 'Wrong PIN', attemptsLeft: attempt.attemptsLeft },
        { status: 401 },
      )
    case 'LOCKED':
      return Response.json(
        { code: 'PIN_LOCKED', message: 'Too many attempts', retryInMs: attempt.retryInMs },
        { status: 423, headers: { 'Retry-After': String(Math.ceil(attempt.retryInMs / 1000)) } },
      )
  }
}
