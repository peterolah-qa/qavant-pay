import { test as base } from '@playwright/test'
import { DashboardPage } from './pages/DashboardPage.ts'
import { DetailPage } from './pages/DetailPage.ts'
import { HistoryPage } from './pages/HistoryPage.ts'
import { PinPage } from './pages/PinPage.ts'
import { TransferPage } from './pages/TransferPage.ts'
import { DRAWER_SELECTOR, isDeployPreview, isNetlifyTooling, removeNetlifyDrawer } from './support/netlify.ts'

type Pages = { pin: PinPage; dashboard: DashboardPage; transfer: TransferPage; history: HistoryPage; detail: DetailPage }

/** Every E2E test gets ready-made page objects: test('…', async ({ pin, dashboard, history }) => …) */
export const test = base.extend<Pages>({
  // On deploy previews, remove Netlify's injected review drawer: it covers the bottom navigation and clicks
  // would land on its iframe. The app itself is untouched; production has no drawer. (docs/journal.md R.1, R.3)
  page: async ({ page, baseURL }, use) => {
    if (isDeployPreview(baseURL)) {
      await page.addInitScript(removeNetlifyDrawer, DRAWER_SELECTOR)
      // and nothing of it loads from netlify.com
      const appHost = new URL(baseURL!).host
      await page.route((url) => isNetlifyTooling(url, appHost), (route) => route.abort('blockedbyclient'))
    }
    await use(page)
  },
  pin: async ({ page }, use) => use(new PinPage(page)),
  dashboard: async ({ page }, use) => use(new DashboardPage(page)),
  transfer: async ({ page }, use) => use(new TransferPage(page)),
  history: async ({ page }, use) => use(new HistoryPage(page)),
  detail: async ({ page }, use) => use(new DetailPage(page)),
})

export { expect } from '@playwright/test'
