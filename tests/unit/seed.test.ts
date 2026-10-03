import { describe, expect, it } from 'vitest'
import { SEED_BALANCE_CENTS, maskIban, seedSandbox, validateIban } from '@qavant-pay/core'

const NOW = new Date('2026-10-03T12:00:00Z')
const ID = '6282f31c-0c2a-470c-b488-b42e84ba2d7b'

describe('seedSandbox', () => {
  const sandbox = seedSandbox(ID, NOW)

  it('starts with the demo balance, a valid IBAN and a fresh PIN state', () => {
    expect(sandbox.account.balanceCents).toBe(SEED_BALANCE_CENTS)
    expect(validateIban(sandbox.account.iban).valid).toBe(true)
    expect(sandbox.pin).toEqual({ failedAttempts: 0, lockedUntil: null })
    expect(sandbox.authenticated).toBe(false)
  })

  it('has 12 transactions, newest first, all in the past', () => {
    const times = sandbox.transactions.map((t) => Date.parse(t.bookedAt))
    expect(times).toHaveLength(12)
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect(Math.max(...times)).toBeLessThan(NOW.getTime())
  })

  it('amounts are integer cents and the sign matches the type', () => {
    for (const t of sandbox.transactions) {
      expect(Number.isInteger(t.amountCents)).toBe(true)
      expect(t.type === 'income' ? t.amountCents > 0 : t.amountCents < 0).toBe(true)
    }
  })

  it('transaction ids are unique and scoped to the sandbox (needed for IDOR tests)', () => {
    const ids = sandbox.transactions.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    const other = seedSandbox('11111111-1111-4111-8111-111111111111', NOW)
    expect(other.transactions.map((t) => t.id)).not.toContain(ids[0])
  })

  it('is deterministic – same input, same sandbox', () => {
    expect(seedSandbox(ID, NOW)).toEqual(sandbox)
  })
})

describe('maskIban', () => {
  it('shows only the last 4 digits', () => {
    expect(maskIban('SK2575000000004017757541')).toBe('•••• 7541')
  })
})
