// History + detail end-to-end against the REAL deployed API (fresh sandbox per test, 12 seeded transactions).
import { expect, test } from './fixtures.ts'

test.describe('History & detail · live API', () => {
  test.skip(({ baseURL }) => !baseURL || baseURL.includes('localhost'), 'needs the deployed API')

  test.beforeEach(async ({ pin, dashboard }) => {
    await pin.open()
    await pin.enter('1234')
    await expect(dashboard.balance).toHaveText('€4,280.52')
  })

  test('all 12 seeded transactions over two pages, no duplicates (HIST-04) @p2', async ({ history }) => {
    await history.openFromDashboard()
    await expect(history.rows).toHaveCount(10)
    await history.loadMore.click()
    await expect(history.rows).toHaveCount(12)
    await expect(history.loadMore).toBeHidden()

    const ids = await history.ids()
    expect(new Set(ids).size).toBe(12)
  })

  test('filter, diacritics-free search and detail work against Postgres (HIST-01, HIST-02, DET-01) @smoke @p2', async ({ history, detail }) => {
    await history.openFromDashboard()

    await history.filter('income').click()
    await expect(history.rows).toHaveCount(4)

    await history.filter('all').click()
    await history.search.fill('kaviaren')
    await expect(history.rows).toHaveCount(1)

    await history.rows.first().getByRole('link').click()
    await expect(detail.name).toHaveText('Bistro Kaviareň')
    await expect(detail.amount).toHaveText('−€4.60')
    await expect(detail.category).toHaveText('Food')
  })

  test('a transaction id from another sandbox shows 404, not the data (IDOR, DET-02) @security @p1', async ({ page, browser, detail }) => {
    // a second visitor = a second, isolated sandbox
    const other = await browser.newContext()
    const otherPage = await other.newPage()
    await otherPage.goto(page.url()) // the app creates the second sandbox itself …
    await expect(otherPage.getByTestId('pin-screen')).toBeVisible() // … and asks for its PIN
    const otherIds = await otherPage.evaluate(async () => {
      await fetch('/api/auth/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"pin":"1234"}' })
      const res = await fetch('/api/transactions?limit=1')
      const body = (await res.json()) as { items: Array<{ id: string }> }
      return body.items.map((t) => t.id)
    })
    await other.close()
    expect(otherIds).toHaveLength(1)

    await page.goto(`/transactions/${otherIds[0]}`)
    await expect(detail.notFoundTitle).toHaveText('Transaction not found')
  })
})
