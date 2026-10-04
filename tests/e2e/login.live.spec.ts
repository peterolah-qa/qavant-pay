// End-to-end against the REAL deployed API (Netlify preview / production): UI + functions + Postgres.
import { expect, test } from './fixtures.ts'

test.describe('Login · live API', () => {
  test.skip(({ baseURL }) => !baseURL || baseURL.includes('localhost'), 'needs the deployed API')

  test('fresh visitor gets a sandbox, logs in with 1234 and sees the seeded balance (AUTH-01) @smoke @p1', async ({ pin, dashboard }) => {
    await pin.open()
    await pin.enter('1234')

    await expect(dashboard.balance).toHaveText('€4,280.52')
    await expect(dashboard.recentTransactions).toHaveCount(4)
  })

  test('session survives a page reload (HttpOnly cookie) @p2', async ({ page, pin, dashboard }) => {
    await pin.open()
    await pin.enter('1234')
    await expect(dashboard.balance).toBeVisible()

    await page.reload()
    await expect(dashboard.balance).toHaveText('€4,280.52')
    await expect(pin.screen).toBeHidden()
  })

  test('wrong PIN is rejected by the server (AUTH-02) @p1', async ({ pin }) => {
    await pin.open()
    await pin.enter('0000')
    await expect(pin.error).toHaveText('Wrong PIN · 2 attempts left')
  })

  test('3 wrong PINs → server lockout shown as a countdown (AUTH-03) @p1', async ({ pin }) => {
    await pin.open()
    for (let i = 0; i < 3; i++) await pin.enter('0000')

    await expect(pin.countdown).toContainText('Too many attempts')
    await expect(pin.key('1')).toBeDisabled()
  })
})
