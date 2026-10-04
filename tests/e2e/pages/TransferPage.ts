import { expect, type Locator, type Page } from '@playwright/test'

export type TransferData = { recipient: string; iban: string; amount: string; note?: string }

/** Page object for the transfer flow: form → review → success. */
export class TransferPage {
  constructor(private readonly page: Page) {}

  // form
  get form(): Locator {
    return this.page.getByTestId('transfer-screen')
  }
  get recipient(): Locator {
    return this.page.getByTestId('transfer-recipient')
  }
  get recipientError(): Locator {
    return this.page.getByTestId('transfer-recipient-error')
  }
  get iban(): Locator {
    return this.page.getByTestId('transfer-iban')
  }
  get ibanStatus(): Locator {
    return this.page.getByTestId('transfer-iban-status')
  }
  get amount(): Locator {
    return this.page.getByTestId('transfer-amount')
  }
  get amountError(): Locator {
    return this.page.getByTestId('transfer-amount-error')
  }
  get note(): Locator {
    return this.page.getByTestId('transfer-note')
  }
  get reviewButton(): Locator {
    return this.page.getByTestId('transfer-review')
  }
  quickAmount(label: '50' | '100' | '500' | 'max'): Locator {
    return this.page.getByTestId(`transfer-quick-${label}`)
  }

  // review
  get review(): Locator {
    return this.page.getByTestId('transfer-review-screen')
  }
  get reviewAmount(): Locator {
    return this.page.getByTestId('review-amount')
  }
  get reviewRecipient(): Locator {
    return this.page.getByTestId('review-recipient')
  }
  get reviewIban(): Locator {
    return this.page.getByTestId('review-iban')
  }
  get reviewBank(): Locator {
    return this.page.getByTestId('review-bank')
  }
  get reviewNote(): Locator {
    return this.page.getByTestId('review-note')
  }
  get reviewError(): Locator {
    return this.page.getByTestId('review-error')
  }
  get sendButton(): Locator {
    return this.page.getByTestId('review-send')
  }
  get editButton(): Locator {
    return this.page.getByTestId('review-edit')
  }

  // success
  get success(): Locator {
    return this.page.getByTestId('transfer-success')
  }
  get successSummary(): Locator {
    return this.page.getByTestId('success-summary')
  }
  get newBalance(): Locator {
    return this.page.getByTestId('success-balance')
  }
  get doneButton(): Locator {
    return this.page.getByTestId('success-done')
  }

  /** From the dashboard, like a user: tap "Send". */
  async openFromDashboard() {
    await this.page.getByTestId('dashboard-send').click()
    await expect(this.form).toBeVisible()
  }

  async fill({ recipient, iban, amount, note }: TransferData) {
    await this.recipient.fill(recipient)
    await this.iban.fill(iban)
    await this.amount.fill(amount)
    if (note !== undefined) await this.note.fill(note)
  }

  /** Fill the form and go to the review step. */
  async fillAndReview(data: TransferData) {
    await this.fill(data)
    await this.reviewButton.click()
    await expect(this.review).toBeVisible()
  }
}
