// A fake Qavant Pay API for UI tests (page.route). Makes the UI testable without a backend and lets us
// produce situations that are slow or hard to create for real: a 30 s lockout, a network failure,
// a response lost AFTER the bank booked the money …
// It is stateful like the real server: a transfer lowers the balance and appears in "Recent".
import type { Page, Route } from '@playwright/test'

export type Reply = { status: number; body?: unknown } | 'network-error'

/**
 * How the fake server answers one transfer request:
 *   Reply           → exactly this response, nothing is booked (e.g. 422 DAILY_LIMIT_EXCEEDED)
 *   'lost-response' → the money IS booked, but the response never reaches the browser
 *   undefined       → normal behaviour (book it, idempotent per Idempotency-Key)
 */
export type TransferReply = Reply | 'lost-response' | undefined

export type TransferRequest = { idempotencyKey: string | null; body: Record<string, unknown> }

export const MOCK_ACCOUNT = { holder: 'Peter', ibanMasked: '•••• 7541', balanceCents: 428052, currency: 'EUR' }

export const MOCK_RECENT = [
  { id: 'tx_aaaaaaaa_01', name: 'Lidl', type: 'spending', category: 'Groceries', amountCents: -3890, bookedAt: '2026-10-03T15:35:00Z', status: 'COMPLETED' },
  { id: 'tx_aaaaaaaa_02', name: 'Martin K.', type: 'income', category: 'Transfer in', amountCents: 12000, bookedAt: '2026-10-03T12:05:00Z', status: 'COMPLETED' },
  { id: 'tx_aaaaaaaa_03', name: 'Bistro Kaviareň', type: 'spending', category: 'Food', amountCents: -460, bookedAt: '2026-10-03T08:15:00Z', status: 'COMPLETED' },
  { id: 'tx_aaaaaaaa_04', name: 'Spotify', type: 'bills', category: 'Subscription', amountCents: -1099, bookedAt: '2026-10-02T09:00:00Z', status: 'COMPLETED' },
]

/** Default PIN behaviour = the real server: 1234 is correct, 3 wrong attempts lock for 30 s. */
function realisticPin(pin: string, wrongSoFar: number): Reply {
  if (pin === '1234') return { status: 200, body: { authenticated: true } }
  const failed = wrongSoFar + 1
  if (failed >= 3) return { status: 423, body: { code: 'PIN_LOCKED', retryInMs: 30_000 } }
  return { status: 401, body: { code: 'WRONG_PIN', attemptsLeft: 3 - failed } }
}

const json = (route: Route, status: number, body: unknown, headers?: Record<string, string>) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers })

type Options = {
  /** start already logged in (skips the PIN screen) */
  loggedIn?: boolean
  onPin?: (pin: string, attempt: number) => Reply
  onTransfer?: (request: TransferRequest, attempt: number) => TransferReply
}

export async function mockBank(page: Page, options: Options = {}) {
  let authenticated = options.loggedIn ?? false
  let attempts = 0
  let wrong = 0
  let balanceCents = MOCK_ACCOUNT.balanceCents
  const recent = [...MOCK_RECENT]
  const booked = new Map<string, unknown>() // Idempotency-Key → original 201 body
  /** every transfer request the browser sent – tests assert on count and keys */
  const transferRequests: TransferRequest[] = []

  await page.route('**/api/account', (route) =>
    authenticated ? json(route, 200, { ...MOCK_ACCOUNT, balanceCents }) : json(route, 401, { code: 'PIN_REQUIRED' }),
  )
  await page.route('**/api/demo/session', (route) => json(route, 201, { expiresAt: '2099-01-01T00:00:00Z' }))
  await page.route('**/api/transactions?*', (route) => {
    const limit = Number(new URL(route.request().url()).searchParams.get('limit') ?? 20)
    return json(route, 200, { items: recent.slice(0, limit), nextCursor: null })
  })
  await page.route('**/api/auth/pin', async (route) => {
    const { pin } = route.request().postDataJSON() as { pin: string }
    attempts++
    const reply = options.onPin ? options.onPin(pin, attempts) : realisticPin(pin, wrong)
    if (reply === 'network-error') return route.abort('internetdisconnected')
    if (reply.status === 200) authenticated = true
    if (reply.status === 401) wrong++
    return json(route, reply.status, reply.body)
  })

  await page.route('**/api/transfers', async (route) => {
    const request: TransferRequest = {
      idempotencyKey: await route.request().headerValue('idempotency-key'),
      body: route.request().postDataJSON() as Record<string, unknown>,
    }
    transferRequests.push(request)

    const reply = options.onTransfer?.(request, transferRequests.length)
    if (reply === 'network-error') return route.abort('internetdisconnected')
    if (reply !== undefined && reply !== 'lost-response') {
      if (reply.status === 401) authenticated = false // the session is gone for every endpoint, like on the server
      return json(route, reply.status, reply.body)
    }

    const key = request.idempotencyKey ?? ''
    const replayed = booked.get(key)
    if (replayed) return json(route, 201, replayed, { 'Idempotent-Replayed': 'true' })

    const amountCents = Number(request.body.amountCents)
    balanceCents -= amountCents
    const transaction = {
      id: `tx_aaaaaaaa_${String(recent.length + 1).padStart(2, '0')}`,
      name: String(request.body.recipientName),
      type: 'spending',
      category: 'Transfer out',
      amountCents: -amountCents,
      bookedAt: new Date().toISOString(),
      status: 'COMPLETED',
    }
    recent.unshift(transaction)
    const body = { transaction, balanceCents }
    booked.set(key, body)

    if (reply === 'lost-response') return route.abort('connectionreset') // booked, but the browser never hears it
    return json(route, 201, body)
  })

  return { transferRequests }
}
