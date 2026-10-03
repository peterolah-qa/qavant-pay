import { test, expect, request as playwrightRequest } from '@playwright/test'

test.describe('API · demo session & account', () => {
  test.skip(({ baseURL }) => !baseURL || baseURL.includes('localhost'), 'API runs on Netlify only')

  test('POST /api/demo/session → 201 and a hardened session cookie @smoke @p1', async ({ request }) => {
    const res = await request.post('/api/demo/session')

    expect(res.status()).toBe(201)
    const cookie = res.headers()['set-cookie']
    expect(cookie).toMatch(/^qp_session=[0-9a-f-]{36};/)
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api']) {
      expect(cookie).toContain(flag)
    }
    expect(Date.parse((await res.json()).expiresAt)).toBeGreaterThan(Date.now())
  })

  test('session + PIN → GET /api/account returns the seeded account @smoke @p1', async ({ request }) => {
    await request.post('/api/demo/session') // the request context keeps the cookie
    await request.post('/api/auth/pin', { data: { pin: '1234' } })

    const res = await request.get('/api/account')
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({
      holder: 'Peter',
      ibanMasked: '•••• 7541',
      balanceCents: 428052,
      currency: 'EUR',
    })
  })

  test('no cookie → 401 UNAUTHENTICATED @p1', async ({ request }) => {
    const res = await request.get('/api/account')
    expect(res.status()).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  test('unknown session id → 401 SESSION_EXPIRED @p2', async ({ request }) => {
    const res = await request.get('/api/account', {
      headers: { cookie: 'qp_session=11111111-1111-4111-8111-111111111111' },
    })
    expect(res.status()).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'SESSION_EXPIRED' })
  })

  test('two visitors get two independent sandboxes @p1', async ({ baseURL }) => {
    const alice = await playwrightRequest.newContext({ baseURL })
    const bob = await playwrightRequest.newContext({ baseURL })
    try {
      const a = await alice.post('/api/demo/session')
      const b = await bob.post('/api/demo/session')
      await alice.post('/api/auth/pin', { data: { pin: '1234' } })
      await bob.post('/api/auth/pin', { data: { pin: '1234' } })
      expect(a.headers()['set-cookie']).not.toBe(b.headers()['set-cookie'])
      expect((await alice.get('/api/account')).status()).toBe(200)
      expect((await bob.get('/api/account')).status()).toBe(200)
    } finally {
      await alice.dispose()
      await bob.dispose()
    }
  })

  test('GET /api/demo/session → 405 @p3', async ({ request }) => {
    expect((await request.get('/api/demo/session')).status()).toBe(405)
  })
})
