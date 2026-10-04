// UI tests with a mocked API (page.route): run everywhere, also locally without a backend.
import { expect, test } from './fixtures.ts'
import { mockBank } from './support/mock-bank.ts'

test.describe('PIN screen · UI (mocked API)', () => {
  test('renders brand, demo hint and full keypad @smoke @p1', async ({ page, pin }) => {
    await mockBank(page)
    await pin.open()

    await expect(page).toHaveTitle(/Qavant Pay/)
    await expect(page.getByTestId('demo-banner')).toHaveText(/no real money/i)
    await expect(page.getByTestId('pin-demo-hint')).toHaveText('Demo PIN: 1234')
    for (const digit of '0123456789') await expect(pin.key(digit)).toBeVisible()
    await expect(page.getByTestId(/^pin-dot-\d$/)).toHaveCount(4)
  })

  test('deep link falls back to the app (SPA routing) @p2', async ({ page, pin }) => {
    await mockBank(page)
    await page.goto('/some/deep/link')
    await expect(pin.screen).toBeVisible()
  })

  test('each digit fills a dot, backspace removes the last one (AUTH-05) @p3', async ({ page, pin }) => {
    await mockBank(page)
    await pin.open()

    await pin.enter('12')
    await expect(pin.filledDots).toHaveCount(2)
    await pin.backspaceKey.click()
    await expect(pin.filledDots).toHaveCount(1)
  })

  test('correct PIN → dashboard with balance and recent transactions @p1', async ({ page, pin, dashboard }) => {
    await mockBank(page)
    await pin.open()
    await pin.enter('1234')

    await expect(dashboard.balance).toHaveText('€4,280.52')
    await expect(dashboard.holder).toHaveText('Peter')
    await expect(dashboard.recentTransactions).toHaveCount(4)
    await expect(dashboard.recentTransactions.first()).toContainText('−€38.90')
    await expect(dashboard.recentTransactions.nth(1)).toContainText('+€120.00')
  })

  test('physical keyboard works too (accessibility) @p2', async ({ page, pin, dashboard }) => {
    await mockBank(page)
    await pin.open()
    await page.keyboard.type('1234')
    await expect(dashboard.balance).toBeVisible()
  })

  test('wrong PIN → message, dots cleared, singular "1 attempt" on the last try (AUTH-02) @p1', async ({ page, pin }) => {
    await mockBank(page)
    await pin.open()

    await pin.enter('0000')
    await expect(pin.error).toHaveText('Wrong PIN · 2 attempts left')
    await expect(pin.filledDots).toHaveCount(0)

    await pin.enter('0000')
    await expect(pin.error).toHaveText('Wrong PIN · 1 attempt left')
  })

  test('typing again clears the old error message @p3', async ({ page, pin }) => {
    await mockBank(page)
    await pin.open()
    await pin.enter('0000')
    await expect(pin.error).toBeVisible()

    await pin.key('1').click()
    await expect(pin.error).toBeHidden()
  })

  test('lockout countdown runs 30 → 0 and re-enables the keypad (AUTH-04, page.clock) @p1', async ({ page, pin }) => {
    await page.clock.install()
    await mockBank(page, { onPin: () => ({ status: 423, body: { code: 'PIN_LOCKED', retryInMs: 30_000 } }) })
    await pin.open()

    await pin.enter('0000')
    await expect(pin.countdown).toHaveText('Too many attempts · try again in 30 s')
    await expect(pin.key('1')).toBeDisabled()

    await page.clock.fastForward('00:29')
    await expect(pin.countdown).toHaveText('Too many attempts · try again in 1 s')
    await expect(pin.key('1')).toBeDisabled()

    await page.clock.fastForward('00:01')
    await expect(pin.countdown).toBeHidden()
    await expect(pin.key('1')).toBeEnabled()
  })

  test('network failure → friendly message, no crash @p2', async ({ page, pin }) => {
    await mockBank(page, { onPin: () => 'network-error' })
    await pin.open()
    await pin.enter('1234')

    await expect(pin.error).toHaveText('Connection problem · please try again')
    await expect(pin.key('1')).toBeEnabled()
  })
})
