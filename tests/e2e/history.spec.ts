// History · UI against the mocked bank. The mock filters with the REAL queryTransactions from core,
// so these tests check the UI wiring (URL, debounce, races, pagination), not the filter logic itself –
// that is covered by unit tests (tests/unit/history.test.ts) and API tests (tests/api/transactions.spec.ts).
import { expect, test } from './fixtures.ts'
import { MOCK_NOW, MOCK_TRANSACTIONS, mockBank } from './support/mock-bank.ts'

test.describe('History · UI (mocked API)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(MOCK_NOW) // "Today" / "Yesterday" are stable
  })

  test('See all → first page grouped by day with the day total @smoke @p2', async ({ page, history }) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/')
    await history.openFromDashboard()

    await expect(page).toHaveURL(/\/history$/)
    await expect(history.rows).toHaveCount(10)
    await expect(history.groupLabels.nth(0)).toHaveText('Today')
    await expect(history.groupLabels.nth(1)).toHaveText('Yesterday')
    // Today = Lidl −38.90, Martin K. +120.00, Bistro −4.60
    await expect(history.groups.first()).toContainText('+€76.50')
    await expect(history.rows.first()).toContainText('Groceries · 17:35') // Bratislava time, not UTC
  })

  test('filter Income → only positive amounts, filter is in the URL (HIST-01) @p2', async ({ page, history }) => {
    await mockBank(page, { loggedIn: true })
    await history.open()

    await history.filter('income').click()
    await expect(history.filter('income')).toHaveAttribute('aria-pressed', 'true')
    await expect(history.rows).toHaveCount(4)
    for (const amount of await history.amounts.allTextContents()) expect(amount).toMatch(/^\+€/)
    await expect(page).toHaveURL(/\/history\?type=income$/)
  })

  test('search "Lidl" → only matching rows; "kaviaren" finds "Kaviareň" (HIST-02) @p2', async ({ page, history }) => {
    await mockBank(page, { loggedIn: true })
    await history.open()

    await history.search.fill('Lidl')
    await expect(history.rows).toHaveCount(1)
    await expect(history.rows.first()).toContainText('Lidl')

    await history.search.fill('kaviaren')
    await expect(history.rows).toHaveCount(1)
    await expect(history.rows.first()).toContainText('Bistro Kaviareň')
  })

  test('search without a result → empty state (HIST-03) @p3', async ({ page, history }) => {
    await mockBank(page, { loggedIn: true })
    await history.open()

    await history.search.fill('xyz')
    await expect(history.empty).toContainText('No transactions found')
    await expect(history.empty).toContainText('Nothing matches “xyz”.')
    await expect(history.loadMore).toBeHidden()
  })

  test('Load more appends the next page – all 12, no duplicates, button disappears (HIST-04) @p2', async ({ page, history }) => {
    await mockBank(page, { loggedIn: true })
    await history.open()
    await expect(history.rows).toHaveCount(10)

    await history.loadMore.click()
    await expect(history.rows).toHaveCount(12)
    await expect(history.loadMore).toBeHidden()

    const ids = await history.ids()
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(MOCK_TRANSACTIONS.map((t) => t.id))
  })

  test('typing is debounced: "tesco" letter by letter → one search request @p3', async ({ page, history }) => {
    const bank = await mockBank(page, { loggedIn: true })
    await history.open()
    await expect(history.rows).toHaveCount(10)

    await history.search.pressSequentially('tesco', { delay: 40 })
    await expect(history.rows).toHaveCount(1)
    expect(bank.historyRequests.filter((p) => p.has('q')).map((p) => p.get('q'))).toEqual(['tesco'])
  })

  test('a slow response for an OLD search never overwrites the new one (race condition) @p2', async ({ page, history }) => {
    await mockBank(page, {
      loggedIn: true,
      onHistory: (params) => (params.get('q') === 'netflix' ? { delayMs: 1_500 } : undefined),
    })
    await history.open()

    await history.search.fill('netflix')
    await page.waitForTimeout(400) // past the debounce → the slow request is on its way
    await history.search.fill('bolt')
    await expect(history.rows).toHaveCount(1)
    await expect(history.rows.first()).toContainText('Bolt')

    await page.waitForTimeout(1_500) // the netflix answer arrives now …
    await expect(history.rows).toHaveCount(1) // … and is ignored
    await expect(history.rows.first()).toContainText('Bolt')
  })

  test('filters survive opening a detail and coming back @p2', async ({ page, history, detail }) => {
    await mockBank(page, { loggedIn: true })
    await history.open()
    await history.filter('bills').click()
    await expect(history.rows).toHaveCount(4)

    await history.rowByName('Orange SK').click()
    await expect(detail.name).toHaveText('Orange SK')
    await detail.backButton.click()

    await expect(page).toHaveURL(/\/history\?type=bills$/)
    await expect(history.filter('bills')).toHaveAttribute('aria-pressed', 'true')
    await expect(history.rows).toHaveCount(4)
  })

  test('a shared link with filters opens the same list @p3', async ({ page, history }) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/history?type=spending&q=groc')
    await expect(history.search).toHaveValue('groc')
    await expect(history.filter('spending')).toHaveAttribute('aria-pressed', 'true')
    await expect(history.rows).toHaveCount(2) // Lidl, Tesco
  })

  test('server error → message with Try again, which recovers @p3', async ({ page, history }) => {
    await mockBank(page, {
      loggedIn: true,
      onHistory: (_params, attempt) => (attempt === 1 ? { status: 500, body: { code: 'INTERNAL' } } : undefined),
    })
    await history.open()
    await expect(history.error).toContainText('Could not load your transactions.')

    await history.error.getByRole('button', { name: 'Try again' }).click()
    await expect(history.rows).toHaveCount(10)
  })
})
