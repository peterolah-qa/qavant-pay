import { describe, expect, it } from 'vitest'
import {
  DAILY_LIMIT_CENTS,
  SEED_BALANCE_CENTS,
  TRANSFER_OUT_CATEGORY,
  executeTransfer,
  localDay,
  seedSandbox,
  sentTodayCents,
  type TransferInput,
} from '@qavant-pay/core'

const NOW = new Date('2026-10-03T12:00:00Z')
const fresh = () => seedSandbox('6282f31c-0c2a-470c-b488-b42e84ba2d7b', NOW)
const VALID: TransferInput = {
  recipientName: 'Jana Nováková',
  iban: 'SK64 0900 0000 0051 2345 6789',
  amountCents: 1000,
  note: 'Rent October',
}

describe('executeTransfer – happy path', () => {
  it('creates the transaction, lowers the balance and puts it on top of the history', () => {
    const state = fresh()
    const result = executeTransfer(state, VALID, NOW)
    if (!result.ok) throw new Error(result.code)

    expect(result.transaction).toEqual({
      id: 'tx_6282f31c_13', // seed has 01–12
      name: 'Jana Nováková',
      type: 'spending',
      category: TRANSFER_OUT_CATEGORY,
      amountCents: -1000,
      bookedAt: NOW.toISOString(),
      status: 'COMPLETED',
      counterpartyIban: 'SK6409000000005123456789', // normalized
      note: 'Rent October',
    })
    expect(result.account.balanceCents).toBe(SEED_BALANCE_CENTS - 1000)
    expect(result.transactions[0]).toBe(result.transaction)
    expect(result.transactions).toHaveLength(13)
  })

  it('never mutates the state it receives', () => {
    const state = fresh()
    const snapshot = structuredClone(state)
    executeTransfer(state, VALID, NOW)
    expect(state).toEqual(snapshot)
  })

  it('trims recipient and note; empty note is omitted', () => {
    const result = executeTransfer(fresh(), { ...VALID, recipientName: '  Jana  ', note: '   ' }, NOW)
    if (!result.ok) throw new Error(result.code)
    expect(result.transaction.name).toBe('Jana')
    expect(result.transaction).not.toHaveProperty('note')
  })
})

describe('executeTransfer – validation (boundary values)', () => {
  it.each([
    [{ recipientName: 'J' }, 'INVALID_RECIPIENT'], // 1 char
    [{ recipientName: 'x'.repeat(71) }, 'INVALID_RECIPIENT'], // 71 chars
    [{ iban: 'SK65 0900 0000 0051 2345 6789' }, 'INVALID_IBAN'],
    [{ iban: 'SK25 7500 0000 0040 1775 7541' }, 'SAME_ACCOUNT'], // the sandbox's own IBAN
    [{ amountCents: 0 }, 'INVALID_AMOUNT'],
    [{ amountCents: -1 }, 'INVALID_AMOUNT'],
    [{ amountCents: 10.5 }, 'INVALID_AMOUNT'],
    [{ amountCents: Number.NaN }, 'INVALID_AMOUNT'],
    [{ note: 'x'.repeat(141) }, 'INVALID_NOTE'],
    [{ amountCents: SEED_BALANCE_CENTS + 1 }, 'INSUFFICIENT_FUNDS'],
    [{ amountCents: DAILY_LIMIT_CENTS + 1 }, 'DAILY_LIMIT_EXCEEDED'],
  ])('%j → %s', (override, code) => {
    expect(executeTransfer(fresh(), { ...VALID, ...override }, NOW)).toMatchObject({ ok: false, code })
  })

  it.each([
    [{ recipientName: 'Jo' }], // 2 chars
    [{ recipientName: 'x'.repeat(70) }], // 70 chars
    [{ note: 'x'.repeat(140) }],
    [{ amountCents: 1 }],
    [{ amountCents: DAILY_LIMIT_CENTS }], // exactly the daily limit
  ])('%j → ok (boundary)', (override) => {
    expect(executeTransfer(fresh(), { ...VALID, ...override }, NOW).ok).toBe(true)
  })
})

describe('daily limit uses the Bratislava calendar day', () => {
  it.each([
    ['2026-10-03T21:59:59Z', '2026-10-03'], // 23:59:59 CEST
    ['2026-10-03T22:00:00Z', '2026-10-04'], // 00:00:00 CEST – new bank day, still Oct 3 in UTC
    ['2026-12-31T22:59:59Z', '2026-12-31'], // 23:59:59 CET (winter, UTC+1)
    ['2026-12-31T23:00:00Z', '2027-01-01'],
  ])('%s → %s', (iso, day) => {
    expect(localDay(new Date(iso))).toBe(day)
  })

  it('a transfer just before local midnight does not count against the next day', () => {
    const lateEvening = new Date('2026-10-03T21:30:00Z') // 23:30 in Bratislava
    const afterMidnight = new Date('2026-10-03T22:30:00Z') // 00:30 next day in Bratislava

    const first = executeTransfer(fresh(), { ...VALID, amountCents: DAILY_LIMIT_CENTS }, lateEvening)
    if (!first.ok) throw new Error(first.code)

    expect(sentTodayCents(first.transactions, lateEvening)).toBe(DAILY_LIMIT_CENTS)
    expect(sentTodayCents(first.transactions, afterMidnight)).toBe(0)
    expect(executeTransfer(first, { ...VALID, amountCents: 1 }, afterMidnight).ok).toBe(true)
    expect(executeTransfer(first, { ...VALID, amountCents: 1 }, lateEvening)).toMatchObject({
      ok: false,
      code: 'DAILY_LIMIT_EXCEEDED',
    })
  })

  it('card payments (seed data) do not consume the transfer limit', () => {
    expect(sentTodayCents(fresh().transactions, NOW)).toBe(0)
  })
})
