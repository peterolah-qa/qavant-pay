// A fake Qavant Pay API for UI tests (page.route). Makes the UI testable without a backend and lets us
// produce situations that are slow or hard to create for real: a 30 s lockout, a network failure …
import type { Page, Route } from '@playwright/test'

export type Reply = { status: number; body?: unknown } | 'network-error'

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

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

export async function mockBank(page: Page, options: { onPin?: (pin: string, attempt: number) => Reply } = {}) {
  let authenticated = false
  let attempts = 0
  let wrong = 0

  await page.route('**/api/account', (route) =>
    authenticated ? json(route, 200, MOCK_ACCOUNT) : json(route, 401, { code: 'PIN_REQUIRED' }),
  )
  await page.route('**/api/demo/session', (route) => json(route, 201, { expiresAt: '2099-01-01T00:00:00Z' }))
  await page.route('**/api/transactions?*', (route) => json(route, 200, { items: MOCK_RECENT, nextCursor: null }))
  await page.route('**/api/auth/pin', async (route) => {
    const { pin } = route.request().postDataJSON() as { pin: string }
    attempts++
    const reply = options.onPin ? options.onPin(pin, attempts) : realisticPin(pin, wrong)
    if (reply === 'network-error') return route.abort('internetdisconnected')
    if (reply.status === 200) authenticated = true
    if (reply.status === 401) wrong++
    return json(route, reply.status, reply.body)
  })
}
