import { test as base } from '@playwright/test'
import { DashboardPage } from './pages/DashboardPage.ts'
import { PinPage } from './pages/PinPage.ts'

/** Every E2E test gets ready-made page objects: test('…', async ({ pin, dashboard }) => …) */
export const test = base.extend<{ pin: PinPage; dashboard: DashboardPage }>({
  pin: async ({ page }, use) => use(new PinPage(page)),
  dashboard: async ({ page }, use) => use(new DashboardPage(page)),
})

export { expect } from '@playwright/test'
