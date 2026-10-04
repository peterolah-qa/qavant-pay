// Accessibility (WCAG 2.2 AA via axe-core) of every screen and its important states.
// Mocked API + fixed clock → the same page every time; runs on every PR.
import { expect, test } from './fixtures.ts'
import { expectNoA11yViolations } from './support/axe.ts'
import { MOCK_NOW, mockBank } from './support/mock-bank.ts'

const JANA = { recipient: 'Jana Nováková', iban: 'SK6409000000005123456789', amount: '25.00', note: 'Rent October' }

test.describe('Accessibility · WCAG 2.2 AA (axe)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(MOCK_NOW)
  })

  test('PIN screen: empty, wrong PIN, locked @a11y @p2', async ({ page, pin }, testInfo) => {
    await mockBank(page)
    await pin.open()
    await expectNoA11yViolations(page, testInfo, 'pin')

    await pin.enter('0000')
    await expect(pin.error).toBeVisible()
    await expectNoA11yViolations(page, testInfo, 'pin-wrong')

    await pin.enter('0000')
    await pin.enter('0000')
    await expect(pin.countdown).toBeVisible()
    await expectNoA11yViolations(page, testInfo, 'pin-locked')
  })

  test('dashboard @a11y @p2', async ({ page, dashboard }, testInfo) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/')
    await expect(dashboard.recentTransactions).toHaveCount(4)
    await expectNoA11yViolations(page, testInfo, 'dashboard')
  })

  test('transfer: form with errors, valid form, review, success @a11y @p2', async ({ page, dashboard, transfer }, testInfo) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/')
    await expect(dashboard.balance).toBeVisible()
    await transfer.openFromDashboard()

    await transfer.fill({ ...JANA, iban: 'SK6509000000005123456789', amount: '0.001' })
    await expect(transfer.amountError).toBeVisible()
    await expectNoA11yViolations(page, testInfo, 'transfer-errors')

    await transfer.fill(JANA)
    await expect(transfer.reviewButton).toBeEnabled()
    await expectNoA11yViolations(page, testInfo, 'transfer-valid')

    await transfer.reviewButton.click()
    await expect(transfer.review).toBeVisible()
    await expectNoA11yViolations(page, testInfo, 'transfer-review')

    await transfer.sendButton.click()
    await expect(transfer.success).toBeVisible()
    await expectNoA11yViolations(page, testInfo, 'transfer-success')
  })

  test('transfer review with a rejection banner @a11y @p3', async ({ page, dashboard, transfer }, testInfo) => {
    await mockBank(page, {
      loggedIn: true,
      onTransfer: () => ({ status: 422, body: { code: 'DAILY_LIMIT_EXCEEDED', maxAllowedCents: 1500 } }),
    })
    await page.goto('/')
    await expect(dashboard.balance).toBeVisible()
    await transfer.openFromDashboard()
    await transfer.fillAndReview(JANA)
    await transfer.sendButton.click()
    await expect(transfer.reviewError).toBeVisible()
    await expectNoA11yViolations(page, testInfo, 'transfer-rejected')
  })

  test('history: list, filtered, empty @a11y @p2', async ({ page, history }, testInfo) => {
    await mockBank(page, { loggedIn: true })
    await history.open()
    await expect(history.rows).toHaveCount(10)
    await expectNoA11yViolations(page, testInfo, 'history')

    await history.filter('income').click()
    await expect(history.rows).toHaveCount(4)
    await expectNoA11yViolations(page, testInfo, 'history-income')

    await history.search.fill('xyz')
    await expect(history.empty).toBeVisible()
    await expectNoA11yViolations(page, testInfo, 'history-empty')
  })

  test('detail and 404 @a11y @p2', async ({ page, detail }, testInfo) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/transactions/tx_aaaaaaaa_02')
    await expect(detail.name).toBeVisible()
    await expectNoA11yViolations(page, testInfo, 'detail')

    await page.goto('/no/such/page')
    await expect(detail.notFound).toBeVisible()
    await expectNoA11yViolations(page, testInfo, 'not-found')
  })
})

// axe finds roughly a third of accessibility problems. Keyboard use has to be tested by actually using it.
test.describe('Accessibility · keyboard only', () => {
  test('a whole transfer can be done with the keyboard alone @a11y @p2', async ({ page, pin, dashboard, transfer }) => {
    await mockBank(page)
    await pin.open()
    await page.keyboard.type('1234') // PIN via physical keys
    await expect(dashboard.balance).toBeVisible()

    await page.getByTestId('dashboard-send').focus()
    await page.keyboard.press('Enter')
    await expect(transfer.form).toBeVisible()

    await transfer.recipient.focus()
    await page.keyboard.type('Jana Nováková')
    await page.keyboard.press('Tab')
    await expect(transfer.iban).toBeFocused() // logical tab order: name → IBAN → amount
    await page.keyboard.type('SK6409000000005123456789')
    await page.keyboard.press('Tab')
    await expect(transfer.amount).toBeFocused()
    await page.keyboard.type('25')
    await page.keyboard.press('Enter') // submits the form → review

    await expect(transfer.review).toBeVisible()
    await transfer.sendButton.focus()
    await page.keyboard.press('Enter')
    await expect(transfer.success).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Money sent' })).toBeFocused() // focus moved to the result
  })

  test('form fields have labels and errors are linked to them @a11y @p2', async ({ page, dashboard, transfer }) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/')
    await expect(dashboard.balance).toBeVisible()
    await transfer.openFromDashboard()

    await expect(page.getByLabel('Recipient name')).toBeVisible()
    await expect(page.getByLabel('IBAN')).toBeVisible()
    await expect(page.getByLabel('Amount')).toBeVisible()

    await transfer.amount.fill('0.001')
    await expect(transfer.amount).toHaveAttribute('aria-invalid', 'true')
    await expect(transfer.amount).toHaveAccessibleDescription('Use at most 2 decimal places')
  })

  test('history filter chips expose their state to screen readers @a11y @p3', async ({ page, history }) => {
    await mockBank(page, { loggedIn: true })
    await history.open()
    await expect(page.getByRole('button', { name: 'All', pressed: true })).toBeVisible()
    await page.getByRole('button', { name: 'Income' }).click()
    await expect(page.getByRole('button', { name: 'Income', pressed: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'All', pressed: false })).toBeVisible()
  })
})
