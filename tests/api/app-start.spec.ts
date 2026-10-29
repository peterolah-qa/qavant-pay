// The two endpoints the web app now starts with, and the SQL round-trip budget measured on the REAL
// deployment (Neon + Netlify) – the same budget tests/integration/perf-budget.test.ts checks locally.
import { test, expect, type APIResponse } from '@playwright/test'

const sqlTrips = (res: APIResponse) => Number(/db;dur=[\d.]+;desc="(\d+) quer/.exec(res.headers()['server-timing'] ?? '')?.[1])

test.describe('API · app start (session + dashboard)', () => {
  test.skip(({ baseURL }) => !baseURL || baseURL.includes('localhost'), 'API runs on Netlify only')

  test('POST /api/session: new visitor → 201 pin + cookie; again → 200 pin; after PIN → 200 app + dashboard @smoke @p1', async ({ request }) => {
    const first = await request.post('/api/session')
    expect(first.status()).toBe(201)
    expect(await first.json()).toMatchObject({ stage: 'pin' })
    expect(first.headers()['set-cookie']).toMatch(/^qp_session=[0-9a-f-]{36};.*HttpOnly/)

    const again = await request.post('/api/session') // the request context keeps the cookie
    expect(again.status()).toBe(200)
    expect(await again.json()).toEqual({ stage: 'pin' }) // no dashboard before the PIN

    const pin = await request.post('/api/auth/pin', { data: { pin: '1234' } })
    const pinBody = await pin.json()
    expect(pinBody).toMatchObject({ authenticated: true, dashboard: { account: { balanceCents: 428052, ibanMasked: '•••• 7541' } } })
    expect(pinBody.dashboard.recent).toHaveLength(4)

    const back = await request.post('/api/session')
    expect(back.status()).toBe(200)
    expect(await back.json()).toMatchObject({ stage: 'app', dashboard: { account: { holder: 'Peter' } } })
  })

  test('GET /api/dashboard: 401 without PIN, then account + 4 recent in one answer @p1', async ({ request }) => {
    await request.post('/api/session')
    expect((await request.get('/api/dashboard')).status()).toBe(401)

    await request.post('/api/auth/pin', { data: { pin: '1234' } })
    const res = await request.get('/api/dashboard')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.account).toEqual({ holder: 'Peter', ibanMasked: '•••• 7541', balanceCents: 428052, currency: 'EUR' })
    expect(body.recent).toHaveLength(4)
  })

  test('unknown API path → JSON 404, not an HTML page @p2', async ({ request }) => {
    const res = await request.get('/api/does-not-exist')
    expect(res.status()).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' })
  })

  test('every response reports Server-Timing; SQL round trips within budget on the real database @perf @p1', async ({ request }) => {
    const health = await request.get('/api/health')
    expect(health.headers()['server-timing']).toMatch(/app;dur=[\d.]+;desc="fn=\S+ db=\S+ (cold|warm)"/)

    const start = await request.post('/api/session')
    expect(sqlTrips(start), 'create sandbox').toBe(1)
    const pin = await request.post('/api/auth/pin', { data: { pin: '1234' } })
    expect(sqlTrips(pin), 'PIN').toBe(4)
    expect(sqlTrips(await request.get('/api/dashboard')), 'dashboard').toBe(1)
    const transfer = await request.post('/api/transfers', {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { recipientName: 'Budget', iban: 'SK6409000000005123456789', amountCents: 100 },
    })
    expect(transfer.status()).toBe(201)
    expect(sqlTrips(transfer), 'transfer').toBe(4)
  })
})
