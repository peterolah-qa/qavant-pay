import { test as base } from '@playwright/test'
import { DashboardPage } from './pages/DashboardPage.ts'
import { PinPage } from './pages/PinPage.ts'
import { TransferPage } from './pages/TransferPage.ts'

/** Every E2E test gets ready-made page objects: test('…', async ({ pin, dashboard, transfer }) => …) */
export const test = base.extend<{ pin: PinPage; dashboard: DashboardPage; transfer: TransferPage }>({
  pin: async ({ page }, use) => use(new PinPage(page)),
  dashboard: async ({ page }, use) => use(new DashboardPage(page)),
  transfer: async ({ page }, use) => use(new TransferPage(page)),
})

export { expect } from '@playwright/test'
