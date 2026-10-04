// Transfer flow · UI against a mocked, stateful API (page.route). Runs everywhere, also locally.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import type { DashboardPage } from './pages/DashboardPage.ts'
import type { TransferPage } from './pages/TransferPage.ts'
import { mockBank } from './support/mock-bank.ts'

const JANA = { recipient: 'Jana Nováková', iban: 'SK6409000000005123456789', amount: '25.00', note: 'Rent October' }
const BAD_CHECKSUM_IBAN = 'SK6509000000005123456789' // one check digit off

async function openTransfer(page: Page, dashboard: DashboardPage, transfer: TransferPage) {
  await page.goto('/')
  await expect(dashboard.balance).toHaveText('€4,280.52')
  await transfer.openFromDashboard()
}

test.describe('Transfer · UI (mocked API)', () => {
  test('happy path: send → success → dashboard shows new balance and the transfer on top (TRF-01) @smoke @p1', async ({ page, dashboard, transfer }) => {
    const bank = await mockBank(page, { loggedIn: true })
    await openTransfer(page, dashboard, transfer)

    await transfer.fillAndReview(JANA)
    await transfer.sendButton.click()

    await expect(transfer.successSummary).toHaveText('€25.00 to Jana Nováková')
    await expect(transfer.newBalance).toHaveText('€4,255.52')
    expect(bank.transferRequests).toHaveLength(1)
    expect(bank.transferRequests[0].body).toEqual({
      recipientName: 'Jana Nováková',
      iban: 'SK6409000000005123456789',
      amountCents: 2500, // integer cents, never 25.0
      note: 'Rent October',
    })

    await transfer.doneButton.click()
    await expect(page).toHaveURL(/\/$/)
    await expect(dashboard.balance).toHaveText('€4,255.52')
    await expect(dashboard.recentTransactions.first()).toContainText('Jana Nováková')
    await expect(dashboard.recentTransactions.first()).toContainText('−€25.00')
  })

  test('review shows exactly what will be sent, IBAN formatted, bank resolved (TRF-08) @p2', async ({ page, dashboard, transfer }) => {
    await mockBank(page, { loggedIn: true })
    await openTransfer(page, dashboard, transfer)

    await transfer.fillAndReview({ ...JANA, recipient: '  Jana Nováková  ', iban: 'sk64 0900 0000 0051 2345 6789', amount: '25,5' })

    await expect(transfer.reviewAmount).toHaveText('€25.50')
    await expect(transfer.reviewRecipient).toHaveText('Jana Nováková')
    await expect(transfer.reviewIban).toHaveText('SK64 0900 0000 0051 2345 6789')
    await expect(transfer.reviewBank).toHaveText('Slovenská sporiteľňa')
    await expect(transfer.reviewNote).toHaveText('Rent October')
    await expect(transfer.sendButton).toHaveText('Send €25.50')
  })

  test('valid IBAN is confirmed with the bank name and formatted on blur @p2', async ({ page, dashboard, transfer }) => {
    await mockBank(page, { loggedIn: true })
    await openTransfer(page, dashboard, transfer)

    await transfer.iban.fill('sk6409000000005123456789')
    await expect(transfer.ibanStatus).toHaveText('Valid IBAN · Slovenská sporiteľňa')
    await transfer.iban.blur()
    await expect(transfer.iban).toHaveValue('SK64 0900 0000 0051 2345 6789')
  })

  test('IBAN with a wrong check digit → error, Review disabled (TRF-02) @p1', async ({ page, dashboard, transfer }) => {
    await mockBank(page, { loggedIn: true })
    await openTransfer(page, dashboard, transfer)

    await transfer.fill({ ...JANA, iban: BAD_CHECKSUM_IBAN })

    await expect(transfer.ibanStatus).toHaveText('Invalid IBAN · check digits do not match')
    await expect(transfer.ibanStatus).toHaveAttribute('data-valid', 'false')
    await expect(transfer.iban).toHaveAttribute('aria-invalid', 'true')
    await expect(transfer.reviewButton).toBeDisabled()
  })

  test('amount over the balance → "Exceeds available balance" (TRF-03) @p1', async ({ page, dashboard, transfer }) => {
    await mockBank(page, { loggedIn: true })
    await openTransfer(page, dashboard, transfer)

    await transfer.fill({ ...JANA, amount: '4280.53' })
    await expect(transfer.amountError).toHaveText('Exceeds available balance of €4,280.52')
    await expect(transfer.reviewButton).toBeDisabled()
  })

  const INVALID_AMOUNTS = [
    ['0', 'Amount must be at least €0.01'],
    ['-1', 'Amount must be at least €0.01'],
    ['0.001', 'Use at most 2 decimal places'],
    ['12,5,0', 'Enter an amount like 25.50'],
  ] as const

  test('amount 0 / −1 / 0.001 rejected, 0.01 allowed (TRF-04) @p1', async ({ page, dashboard, transfer }) => {
    await mockBank(page, { loggedIn: true })
    await openTransfer(page, dashboard, transfer)
    await transfer.fill(JANA)

    for (const [amount, message] of INVALID_AMOUNTS) {
      await transfer.amount.fill(amount)
      await expect(transfer.amountError, `amount "${amount}"`).toHaveText(message)
      await expect(transfer.reviewButton).toBeDisabled()
    }

    await transfer.amount.fill('0.01')
    await expect(transfer.amountError).toBeHidden()
    await expect(transfer.reviewButton).toBeEnabled()
  })

  test('single transfer over the €2,000 daily limit is blocked before sending (BR-05) @p2', async ({ page, dashboard, transfer }) => {
    const bank = await mockBank(page, { loggedIn: true })
    await openTransfer(page, dashboard, transfer)

    await transfer.fill({ ...JANA, amount: '2000.01' })
    await expect(transfer.amountError).toHaveText('Exceeds the daily limit of €2,000.00')
    await expect(transfer.reviewButton).toBeDisabled()
    expect(bank.transferRequests).toHaveLength(0)
  })

  test('quick amounts and Max fill the right value – Max = min(balance, daily limit) (TRF-09) @p3', async ({ page, dashboard, transfer }) => {
    await mockBank(page, { loggedIn: true })
    await openTransfer(page, dashboard, transfer)

    await transfer.quickAmount('50').click()
    await expect(transfer.amount).toHaveValue('50.00')
    await transfer.quickAmount('500').click()
    await expect(transfer.amount).toHaveValue('500.00')
    await transfer.quickAmount('max').click()
    await expect(transfer.amount).toHaveValue('2000.00')
  })

  test('server rejects with the daily limit → message with what is left, Edit keeps the form (TRF-05) @p1', async ({ page, dashboard, transfer }) => {
    await mockBank(page, {
      loggedIn: true,
      onTransfer: () => ({ status: 422, body: { code: 'DAILY_LIMIT_EXCEEDED', maxAllowedCents: 1500 } }),
    })
    await openTransfer(page, dashboard, transfer)
    await transfer.fillAndReview(JANA)
    await transfer.sendButton.click()

    await expect(transfer.reviewError).toHaveText('Daily limit reached · you can send €15.00 more today')
    await expect(transfer.sendButton).toBeDisabled() // the same request would fail again

    await transfer.editButton.click()
    await expect(transfer.recipient).toHaveValue('Jana Nováková')
    await expect(transfer.amount).toHaveValue('25.00')
  })

  test('double click on Send → exactly one transfer request (TRF-06) @p1', async ({ page, dashboard, transfer }) => {
    const bank = await mockBank(page, { loggedIn: true })
    await openTransfer(page, dashboard, transfer)
    await transfer.fillAndReview(JANA)

    await transfer.sendButton.dblclick()

    await expect(transfer.newBalance).toHaveText('€4,255.52')
    expect(bank.transferRequests).toHaveLength(1)
  })

  test('two clicks within one JS task (faster than React re-renders) → still one request (TRF-06) @p1', async ({ page, dashboard, transfer }) => {
    const bank = await mockBank(page, { loggedIn: true })
    await openTransfer(page, dashboard, transfer)
    await transfer.fillAndReview(JANA)

    // A real double tap on a slow phone can land before the disabled button is rendered.
    await transfer.sendButton.evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })

    await expect(transfer.newBalance).toHaveText('€4,255.52')
    expect(bank.transferRequests).toHaveLength(1)
  })

  test('response lost after the bank booked it → retry uses the SAME Idempotency-Key, money leaves once (BR-06) @p1', async ({ page, dashboard, transfer }) => {
    const bank = await mockBank(page, {
      loggedIn: true,
      onTransfer: (_request, attempt) => (attempt === 1 ? 'lost-response' : undefined),
    })
    await openTransfer(page, dashboard, transfer)
    await transfer.fillAndReview(JANA)

    await transfer.sendButton.click()
    await expect(transfer.reviewError).toContainText('Trying again is safe')
    await expect(transfer.sendButton).toHaveText('Try again')

    await transfer.sendButton.click()
    await expect(transfer.newBalance).toHaveText('€4,255.52') // not €4,230.52

    expect(bank.transferRequests).toHaveLength(2)
    const [first, retry] = bank.transferRequests
    expect(first.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(retry.idempotencyKey).toBe(first.idempotencyKey)
  })

  test('an edited transfer is a NEW transfer → new Idempotency-Key @p2', async ({ page, dashboard, transfer }) => {
    const bank = await mockBank(page, {
      loggedIn: true,
      onTransfer: (_request, attempt) => (attempt === 1 ? 'network-error' : undefined),
    })
    await openTransfer(page, dashboard, transfer)
    await transfer.fillAndReview(JANA)
    await transfer.sendButton.click()
    await expect(transfer.reviewError).toBeVisible()

    await transfer.editButton.click()
    await transfer.amount.fill('30')
    await transfer.reviewButton.click()
    await transfer.sendButton.click()
    await expect(transfer.newBalance).toHaveText('€4,250.52')

    const [first, second] = bank.transferRequests
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
  })

  test('session lost while sending → back to the PIN screen @p2', async ({ page, dashboard, transfer, pin }) => {
    await mockBank(page, { loggedIn: true, onTransfer: () => ({ status: 401, body: { code: 'SESSION_EXPIRED' } }) })
    await openTransfer(page, dashboard, transfer)
    await transfer.fillAndReview(JANA)
    await transfer.sendButton.click()
    await expect(pin.screen).toBeVisible()
  })

  test('deep link /transfer survives the PIN login; Back button and browser history work @p2', async ({ page, pin, dashboard, transfer }) => {
    await mockBank(page)
    await page.goto('/transfer')
    await pin.enter('1234')
    await expect(transfer.form).toBeVisible()

    await page.getByTestId('transfer-back').click()
    await expect(page).toHaveURL(/\/$/)
    await expect(dashboard.balance).toBeVisible()

    await page.goBack()
    await expect(transfer.form).toBeVisible()
  })
})
