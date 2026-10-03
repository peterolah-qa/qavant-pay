import { test, expect } from '@playwright/test'

test.describe('API · POST /api/auth/pin', () => {
  test.skip(({ baseURL }) => !baseURL || baseURL.includes('localhost'), 'API runs on Netlify only')

  test.beforeEach(async ({ request }) => {
    await request.post('/api/demo/session') // fresh sandbox for every test
  })

  const enterPin = (request: import('@playwright/test').APIRequestContext, pin: string) =>
    request.post('/api/auth/pin', { data: { pin } })

  test('full login flow: PIN_REQUIRED → wrong PIN → correct PIN → account @smoke @p1', async ({ request }) => {
    const before = await request.get('/api/account')
    expect(before.status()).toBe(401)
    expect(await before.json()).toMatchObject({ code: 'PIN_REQUIRED' })

    const wrong = await enterPin(request, '0000')
    expect(wrong.status()).toBe(401)
    expect(await wrong.json()).toMatchObject({ code: 'WRONG_PIN', attemptsLeft: 2 })

    const ok = await enterPin(request, '1234')
    expect(ok.status()).toBe(200)
    expect(await ok.json()).toEqual({ authenticated: true })

    expect((await request.get('/api/account')).status()).toBe(200)
  })

  test('3 wrong PINs → 423 PIN_LOCKED, correct PIN refused while locked @p1', async ({ request }) => {
    await enterPin(request, '0000')
    await enterPin(request, '0000')

    const locked = await enterPin(request, '0000')
    expect(locked.status()).toBe(423)
    expect(locked.headers()['retry-after']).toBe('30')
    expect(await locked.json()).toMatchObject({ code: 'PIN_LOCKED' })

    const stillLocked = await enterPin(request, '1234')
    expect(stillLocked.status()).toBe(423)
    expect((await request.get('/api/account')).status()).toBe(401)
  })

  for (const pin of ['abcd', '123', '12345']) {
    test(`invalid PIN format ${JSON.stringify(pin)} → 400 @p2`, async ({ request }) => {
      const res = await enterPin(request, pin)
      expect(res.status()).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'INVALID_REQUEST' })
    })
  }
})
