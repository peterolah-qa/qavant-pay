// Request budget of the web app: how many API calls until the visitor sees something.
// Every call is a trip from Europe to the function in Ohio (≈ 160 ms, docs/performance.md),
// so the COUNT is what decides how fast the app feels – and a count cannot be flaky.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { mockBank } from './support/mock-bank.ts'

function recordApiCalls(page: Page): string[] {
  const calls: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.pathname.startsWith('/api/')) calls.push(`${r.method()} ${url.pathname}`)
  })
  return calls
}

test.describe('Performance budget · API calls (mocked API)', () => {
  test('first visit: PIN screen after 1 call, dashboard after 1 more @perf @p1', async ({ page, pin, dashboard }) => {
    await mockBank(page)
    const calls = recordApiCalls(page)

    await pin.open()
    expect(calls).toEqual(['POST /api/session']) // was: GET /api/account (401) + POST /api/demo/session

    await pin.enter('1234')
    await expect(dashboard.balance).toHaveText('€4,280.52')
    await expect(dashboard.recentTransactions).toHaveCount(4)
    expect(calls).toEqual(['POST /api/session', 'POST /api/auth/pin']) // dashboard data came with the PIN answer
  })

  test('returning visitor (PIN already entered): dashboard after 1 call @perf @p1', async ({ page, dashboard }) => {
    await mockBank(page, { loggedIn: true })
    const calls = recordApiCalls(page)

    await page.goto('/')
    await expect(dashboard.balance).toHaveText('€4,280.52')
    expect(calls).toEqual(['POST /api/session'])
  })

  test('coming back to the dashboard later loads FRESH data (1 call), not the login copy @perf @p2', async ({ page, pin, dashboard, transfer }) => {
    await mockBank(page)
    await pin.open()
    await pin.enter('1234')
    await expect(dashboard.balance).toHaveText('€4,280.52')

    await transfer.openFromDashboard()
    await transfer.fillAndReview({ recipient: 'Jana Nováková', iban: 'SK6409000000005123456789', amount: '25' })
    await transfer.sendButton.click()
    const calls = recordApiCalls(page)
    await transfer.doneButton.click()

    await expect(dashboard.balance).toHaveText('€4,255.52') // not the €4,280.52 from the login answer
    expect(calls).toEqual(['GET /api/dashboard'])
  })
})
