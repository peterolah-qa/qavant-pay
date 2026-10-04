import { describe, expect, it } from 'vitest'
import {
  DAILY_LIMIT_CENTS,
  maxTransferCents,
  toAmountInput,
  validateTransferDraft,
  type TransferDraft,
} from '@qavant-pay/core'

const BALANCE = 428_052
const VALID: TransferDraft = {
  recipientName: '  Jana Nováková ',
  iban: 'sk64 0900 0000 0051 2345 6789',
  amount: '25,50',
  note: ' Rent ',
}
const draft = (patch: Partial<TransferDraft>): TransferDraft => ({ ...VALID, ...patch })

describe('validateTransferDraft', () => {
  it('valid form → normalized request body for the API (TRF-07)', () => {
    const result = validateTransferDraft(VALID, BALANCE)
    expect(result).toEqual({
      ok: true,
      errors: {},
      bank: 'Slovenská sporiteľňa',
      input: { recipientName: 'Jana Nováková', iban: 'SK6409000000005123456789', amountCents: 2550, note: 'Rent' },
    })
  })

  it('empty note is left out of the body', () => {
    const result = validateTransferDraft(draft({ note: '   ' }), BALANCE)
    expect(result.ok && result.input).not.toHaveProperty('note')
  })

  it('reports every invalid field at once', () => {
    const result = validateTransferDraft({ recipientName: 'J', iban: 'SK65 0900 0000 0051 2345 6789', amount: '0', note: 'x'.repeat(141) }, BALANCE)
    expect(result).toEqual({
      ok: false,
      errors: { recipientName: 'TOO_SHORT', iban: 'CHECKSUM', amount: 'NOT_POSITIVE', note: 'TOO_LONG' },
    })
  })

  it.each([
    ['0', 'NOT_POSITIVE'],
    ['-1', 'NOT_POSITIVE'],
    ['0.001', 'PRECISION'],
    ['abc', 'FORMAT'],
    ['', 'EMPTY'],
  ])('amount %j → %s (TRF-04)', (amount, reason) => {
    expect(validateTransferDraft(draft({ amount }), BALANCE).errors.amount).toBe(reason)
  })

  it('0.01 is the smallest allowed amount (TRF-04)', () => {
    expect(validateTransferDraft(draft({ amount: '0.01' }), BALANCE).ok).toBe(true)
  })

  it('balance is checked before the daily limit (BR-04 before BR-05)', () => {
    expect(validateTransferDraft(draft({ amount: '4280.53' }), BALANCE).errors.amount).toBe('INSUFFICIENT_FUNDS')
    expect(validateTransferDraft(draft({ amount: '2000.01' }), BALANCE).errors.amount).toBe('DAILY_LIMIT_EXCEEDED')
    expect(validateTransferDraft(draft({ amount: '2000.00' }), BALANCE).ok).toBe(true)
  })

  it('recipient name length 2–70 after trimming', () => {
    expect(validateTransferDraft(draft({ recipientName: ' J ' }), BALANCE).errors.recipientName).toBe('TOO_SHORT')
    expect(validateTransferDraft(draft({ recipientName: 'Jo' }), BALANCE).ok).toBe(true)
    expect(validateTransferDraft(draft({ recipientName: 'x'.repeat(70) }), BALANCE).ok).toBe(true)
    expect(validateTransferDraft(draft({ recipientName: 'x'.repeat(71) }), BALANCE).errors.recipientName).toBe('TOO_LONG')
  })
})

describe('maxTransferCents / toAmountInput (TRF-09)', () => {
  it('Max = balance, capped by the daily limit', () => {
    expect(maxTransferCents(BALANCE)).toBe(DAILY_LIMIT_CENTS)
    expect(maxTransferCents(150_005)).toBe(150_005)
    expect(maxTransferCents(-5)).toBe(0)
  })

  it.each([
    [200_000, '2000.00'],
    [5_000, '50.00'],
    [1, '0.01'],
    [150_005, '1500.05'],
  ])('%i cents → %j', (cents, text) => {
    expect(toAmountInput(cents)).toBe(text)
  })
})
