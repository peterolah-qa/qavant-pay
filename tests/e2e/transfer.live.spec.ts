// Transfer end-to-end against the REAL deployed API: UI + Netlify functions + Postgres.
// Every test gets a fresh browser context → a fresh sandbox with the seeded €4,280.52.
import { expect, test } from './fixtures.ts'

const JANA = { recipient: 'Jana Nováková', iban: 'SK64 0900 0000 0051 2345 6789', amount: '25.00', note: 'E2E live' }

test.describe('Transfer · live API', () => {
  test.skip(({ baseURL }) => !baseURL || baseURL.includes('localhost'), 'needs the deployed API')

  test.beforeEach(async ({ pin, dashboard }) => {
    await pin.open()
    await pin.enter('1234')
    await expect(dashboard.balance).toHaveText('€4,280.52')
  })

  test('valid transfer lowers the balance and appears on top of Recent (TRF-01) @smoke @p1', async ({ page, dashboard, transfer }) => {
    await transfer.openFromDashboard()
    await transfer.fillAndReview(JANA)
    await transfer.sendButton.click()

    await expect(transfer.newBalance).toHaveText('€4,255.52')
    await transfer.doneButton.click()

    await expect(dashboard.balance).toHaveText('€4,255.52')
    await expect(dashboard.recentTransactions.first()).toContainText('Jana Nováková')
    await expect(dashboard.recentTransactions.first()).toContainText('−€25.00')

    await page.reload() // persisted in Postgres, not just in React state
    await expect(dashboard.balance).toHaveText('€4,255.52')
  })

  test('double click on Send books exactly one transaction (TRF-06) @p1', async ({ page, dashboard, transfer }) => {
    await transfer.openFromDashboard()
    await transfer.fillAndReview(JANA)
    await transfer.sendButton.evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })

    await expect(transfer.newBalance).toHaveText('€4,255.52')
    await transfer.doneButton.click()
    await page.reload()
    await expect(dashboard.balance).toHaveText('€4,255.52')
    await expect(dashboard.recentTransactions.filter({ hasText: 'Jana Nováková' })).toHaveCount(1)
  })
})
