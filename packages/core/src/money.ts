// Money is stored and computed in integer cents. Never in floating point:
// 0.1 + 0.2 === 0.30000000000000004 and 19.99 * 100 === 1998.9999999999998.

export type Cents = number

export type AmountError = 'EMPTY' | 'FORMAT' | 'PRECISION' | 'NOT_POSITIVE' | 'TOO_LARGE'

export type AmountResult = { ok: true; cents: Cents } | { ok: false; reason: AmountError }

/** Upper bound for a single amount: €1,000,000.00 */
export const MAX_AMOUNT_CENTS: Cents = 100_000_000

/**
 * Parses user input into cents without ever touching floats.
 * Accepts "12", "12.5", "12,50" (Slovak comma) and spaces as thousands separators.
 */
export function parseAmount(input: string): AmountResult {
  const value = input.replace(/\s+/g, '').replace(',', '.')

  if (value === '') return { ok: false, reason: 'EMPTY' }

  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value)
  if (!match) return { ok: false, reason: 'FORMAT' }

  const [, sign, whole, fraction = ''] = match
  if (fraction.length > 2) return { ok: false, reason: 'PRECISION' }

  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (sign === '-' || cents === 0) return { ok: false, reason: 'NOT_POSITIVE' }
  if (cents > MAX_AMOUNT_CENTS) return { ok: false, reason: 'TOO_LARGE' }

  return { ok: true, cents }
}

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })

/** 428052 → "€4,280.52" */
export function formatCents(cents: Cents): string {
  return eur.format(cents / 100)
}
