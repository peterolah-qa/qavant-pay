import type { Locator, Page } from '@playwright/test'

export class DashboardPage {
  constructor(private readonly page: Page) {}

  get screen(): Locator {
    return this.page.getByTestId('dashboard-screen')
  }
  get balance(): Locator {
    return this.page.getByTestId('balance-amount')
  }
  get holder(): Locator {
    return this.page.getByTestId('dashboard-holder')
  }
  get recentTransactions(): Locator {
    return this.page.locator('[data-testid^="recent-tx-"]')
  }
}
