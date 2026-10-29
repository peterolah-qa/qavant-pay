import { test as base } from '@playwright/test'
import { DashboardPage } from './pages/DashboardPage.ts'
import { DetailPage } from './pages/DetailPage.ts'
import { HistoryPage } from './pages/HistoryPage.ts'
import { PinPage } from './pages/PinPage.ts'
import { TransferPage } from './pages/TransferPage.ts'
import { isDeployPreview, isNetlifyTooling } from './support/netlify.ts'

type Pages = { pin: PinPage; dashboard: DashboardPage; transfer: TransferPage; history: HistoryPage; detail: DetailPage }

/** Every E2E test gets ready-made page objects: test('…', async ({ pin, dashboard, history }) => …) */
export const test = base.extend<Pages>({
  // On deploy previews, block Netlify's injected review tooling before the page loads: it covers the bottom
  // navigation and would make clicks land on its iframe. The app itself is untouched; production has no drawer.
  page: async ({ page, baseURL }, use) => {
    if (isDeployPreview(baseURL)) {
      const appHost = new URL(baseURL!).host
      await page.route((url) => isNetlifyTooling(url, appHost), (route) => route.abort('blockedbyclient'))
      // second safety net, by the iframe title seen in the CI log – in case the drawer ever loads from elsewhere
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style')
          style.textContent = 'iframe[title="Netlify Drawer"]{display:none!important}'
          document.head.append(style)
        })
      })
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
