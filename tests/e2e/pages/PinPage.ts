import { expect, type Locator, type Page } from '@playwright/test'

/** Page object for the PIN screen – tests talk about "enter PIN", not about CSS or test ids. */
export class PinPage {
  constructor(private readonly page: Page) {}

  get screen(): Locator {
    return this.page.getByTestId('pin-screen')
  }
  get filledDots(): Locator {
    return this.page.locator('[data-testid^="pin-dot-"][data-filled="true"]')
  }
  get error(): Locator {
    return this.page.getByTestId('pin-error')
  }
  get countdown(): Locator {
    return this.page.getByTestId('pin-lock-countdown')
  }
  get backspaceKey(): Locator {
    return this.page.getByTestId('pin-backspace')
  }

  key(digit: string): Locator {
    return this.page.getByTestId(`pin-key-${digit}`)
  }

  async open() {
    await this.page.goto('/')
    await expect(this.screen).toBeVisible()
  }

  /** Taps the digits on the on-screen keypad, like a user on a phone. */
  async enter(pin: string) {
    for (const digit of pin) await this.key(digit).click()
  }
}
