import { expect, type Locator, type Page } from '@playwright/test'
import type { TxFilter } from '@qavant-pay/core'

/** Page object for /history: search, filter chips, day groups, Load more. */
export class HistoryPage {
  constructor(private readonly page: Page) {}

  get screen(): Locator {
    return this.page.getByTestId('history-screen')
  }
  get search(): Locator {
    return this.page.getByTestId('history-search')
  }
  get rows(): Locator {
    return this.page.locator('[data-testid^="history-tx-tx_"]')
  }
  get amounts(): Locator {
    return this.page.getByTestId('history-tx-amount')
  }
  get groupLabels(): Locator {
    return this.page.getByTestId('history-group-label')
  }
  get groups(): Locator {
    return this.page.getByTestId('history-group')
  }
  get empty(): Locator {
    return this.page.getByTestId('history-empty')
  }
  get error(): Locator {
    return this.page.getByTestId('history-error')
  }
  get loadMore(): Locator {
    return this.page.getByTestId('history-load-more')
  }
  get backButton(): Locator {
    return this.page.getByTestId('history-back')
  }

  filter(type: TxFilter): Locator {
    return this.page.getByTestId(`history-filter-${type}`)
  }
  row(id: string): Locator {
    return this.page.getByTestId(`history-tx-${id}`)
  }
  rowByName(name: string): Locator {
    return this.rows.filter({ hasText: name })
  }

  async open() {
    await this.page.goto('/history')
    await expect(this.screen).toBeVisible()
  }

  /** From the dashboard, like a user: "See all". */
  async openFromDashboard() {
    await this.page.getByTestId('dashboard-see-all').click()
    await expect(this.screen).toBeVisible()
  }

  /** ids of the rows currently shown, in order */
  async ids(): Promise<string[]> {
    const testIds = await this.rows.evaluateAll((rows) => rows.map((r) => r.getAttribute('data-testid') ?? ''))
    return testIds.map((t) => t.replace('history-tx-', ''))
  }
}
