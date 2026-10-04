import { test as base } from '@playwright/test'
import { DashboardPage } from './pages/DashboardPage.ts'
import { DetailPage } from './pages/DetailPage.ts'
import { HistoryPage } from './pages/HistoryPage.ts'
import { PinPage } from './pages/PinPage.ts'
import { TransferPage } from './pages/TransferPage.ts'

type Pages = { pin: PinPage; dashboard: DashboardPage; transfer: TransferPage; history: HistoryPage; detail: DetailPage }

/** Every E2E test gets ready-made page objects: test('…', async ({ pin, dashboard, history }) => …) */
export const test = base.extend<Pages>({
  pin: async ({ page }, use) => use(new PinPage(page)),
  dashboard: async ({ page }, use) => use(new DashboardPage(page)),
  transfer: async ({ page }, use) => use(new TransferPage(page)),
  history: async ({ page }, use) => use(new HistoryPage(page)),
  detail: async ({ page }, use) => use(new DetailPage(page)),
})

export { expect } from '@playwright/test'
