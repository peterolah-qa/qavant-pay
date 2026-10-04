import type { Locator, Page } from '@playwright/test'

/** Page object for /transactions/:id and the 404 screen. */
export class DetailPage {
  constructor(private readonly page: Page) {}

  get screen(): Locator {
    return this.page.getByTestId('detail-screen')
  }
  get name(): Locator {
    return this.page.getByTestId('detail-name')
  }
  get amount(): Locator {
    return this.page.getByTestId('detail-amount')
  }
  get status(): Locator {
    return this.page.getByTestId('detail-status')
  }
  get date(): Locator {
    return this.page.getByTestId('detail-date')
  }
  get category(): Locator {
    return this.page.getByTestId('detail-category')
  }
  get iban(): Locator {
    return this.page.getByTestId('detail-iban')
  }
  get note(): Locator {
    return this.page.getByTestId('detail-note')
  }
  get id(): Locator {
    return this.page.getByTestId('detail-id')
  }
  get backButton(): Locator {
    return this.page.getByTestId('detail-back')
  }

  // 404
  get notFound(): Locator {
    return this.page.getByTestId('not-found-screen')
  }
  get notFoundTitle(): Locator {
    return this.page.getByTestId('not-found-title')
  }
  get homeLink(): Locator {
    return this.page.getByTestId('not-found-home')
  }
}
