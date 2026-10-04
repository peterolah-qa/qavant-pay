// Transaction detail + 404 · UI against the mocked bank.
import { expect, test } from './fixtures.ts'
import { MOCK_NOW, mockBank } from './support/mock-bank.ts'

test.describe('Detail & 404 · UI (mocked API)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(MOCK_NOW)
  })

  test('detail shows the same transaction as the list row (DET-01) @p2', async ({ page, history, detail }) => {
    await mockBank(page, { loggedIn: true })
    await history.open()

    const row = history.row('tx_aaaaaaaa_01')
    await expect(row).toContainText('Lidl')
    await expect(row).toContainText('−€38.90')
    await row.click()

    await expect(page).toHaveURL(/\/transactions\/tx_aaaaaaaa_01$/)
    await expect(detail.name).toHaveText('Lidl')
    await expect(detail.amount).toHaveText('−€38.90')
    await expect(detail.status).toHaveText('Completed')
    await expect(detail.category).toHaveText('Groceries')
    await expect(detail.date).toHaveText('3 Oct 2026, 17:35')
    await expect(detail.id).toHaveText('tx_aaaaaaaa_01')
  })

  test('recent row on the dashboard opens the detail, Back returns to the dashboard @p3', async ({ page, dashboard, detail }) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/')
    await dashboard.recentTransactions.nth(1).getByRole('link').click()

    await expect(detail.name).toHaveText('Martin K.')
    await expect(detail.amount).toHaveText('+€120.00')
    await detail.backButton.click()
    await expect(dashboard.balance).toBeVisible()
  })

  test('a sent transfer shows the recipient IBAN and the note @p2', async ({ page, dashboard, transfer, detail }) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/')
    await transfer.openFromDashboard()
    await transfer.fillAndReview({ recipient: 'Jana Nováková', iban: 'SK6409000000005123456789', amount: '25', note: 'Rent October' })
    await transfer.sendButton.click()
    await transfer.doneButton.click()

    await dashboard.recentTransactions.first().getByRole('link').click()
    await expect(detail.name).toHaveText('Jana Nováková')
    await expect(detail.amount).toHaveText('−€25.00')
    await expect(detail.category).toHaveText('Transfer out')
    await expect(detail.iban).toHaveText('SK64 0900 0000 0051 2345 6789')
    await expect(detail.note).toHaveText('Rent October')
  })

  test('unknown transaction id → 404 screen (DET-02) @p3', async ({ page, detail }) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/transactions/tx_aaaaaaaa_99')
    await expect(detail.notFoundTitle).toHaveText('Transaction not found')
    await expect(page).toHaveTitle(/Transaction not found/)
  })

  test('malformed id → 404 without even asking the API @p3', async ({ page, detail }) => {
    await mockBank(page, { loggedIn: true })
    const detailRequests: string[] = []
    page.on('request', (r) => {
      if (/\/api\/transactions\//.test(r.url())) detailRequests.push(r.url())
    })

    await page.goto('/transactions/%3Cscript%3E')
    await expect(detail.notFoundTitle).toHaveText('Transaction not found')
    expect(detailRequests).toEqual([])
  })

  test('unknown page → 404, "Back to home" → dashboard @p3', async ({ page, dashboard, detail }) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/no/such/page')
    await expect(detail.notFoundTitle).toHaveText('Page not found')

    await detail.homeLink.click()
    await expect(dashboard.balance).toBeVisible()
  })

  test('deep link to a detail: Back stays in the app (goes to History, not off-site) @p3', async ({ page, history, detail }) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/transactions/tx_aaaaaaaa_05')
    await expect(detail.name).toHaveText('Qavant s.r.o.')

    await detail.backButton.click()
    await expect(history.screen).toBeVisible()
  })
})
