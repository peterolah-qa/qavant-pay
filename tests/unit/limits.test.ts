import { describe, expect, it } from 'vitest'
import { DAILY_LIMIT_CENTS, checkTransfer, remainingDailyLimit } from '@qavant-pay/core'

const RICH = 1_000_000 // €10,000 balance, so only the daily limit matters

describe('daily limit €2,000 – boundary values (BR-05)', () => {
  it.each([
    // sentToday, amount,  expected
    [0,          200_000, 'ok'], // exactly the limit
    [0,          200_001, 'DAILY_LIMIT_EXCEEDED'], // limit + 1 cent
    [150_000,     50_000, 'ok'], // fills the rest of the limit
    [150_000,     50_001, 'DAILY_LIMIT_EXCEEDED'],
    [200_000,          1, 'DAILY_LIMIT_EXCEEDED'], // limit already used up
  ])('sent %i, sending %i → %s', (sentTodayCents, amountCents, expected) => {
    const result = checkTransfer({ amountCents, balanceCents: RICH, sentTodayCents })
    expect(result.ok ? 'ok' : result.code).toBe(expected)
  })
})

describe('balance – boundary values (BR-04)', () => {
  it.each([
    [10_000, 10_000, 'ok'], // send the whole balance
    [10_000, 10_001, 'INSUFFICIENT_FUNDS'], // balance + 1 cent
  ])('balance %i, sending %i → %s', (balanceCents, amountCents, expected) => {
    const result = checkTransfer({ amountCents, balanceCents, sentTodayCents: 0 })
    expect(result.ok ? 'ok' : result.code).toBe(expected)
  })
})

describe('rule priority and helpers', () => {
  it('no money AND no limit → INSUFFICIENT_FUNDS is reported first', () => {
    expect(
      checkTransfer({ amountCents: 300_000, balanceCents: 100, sentTodayCents: DAILY_LIMIT_CENTS }),
    ).toEqual({ ok: false, code: 'INSUFFICIENT_FUNDS', maxAllowedCents: 100 })
  })

  it('error tells the UI how much is still allowed', () => {
    expect(
      checkTransfer({ amountCents: 60_000, balanceCents: RICH, sentTodayCents: 150_000 }),
    ).toEqual({ ok: false, code: 'DAILY_LIMIT_EXCEEDED', maxAllowedCents: 50_000 })
  })

  it.each([
    [0, 200_000],
    [199_999, 1],
    [250_000, 0], // never negative
  ])('remainingDailyLimit(%i) = %i', (sent, remaining) => {
    expect(remainingDailyLimit(sent)).toBe(remaining)
  })
})
