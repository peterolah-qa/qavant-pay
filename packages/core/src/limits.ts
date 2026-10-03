import type { Cents } from './money.ts'

/** BR-05: outgoing transfers per day must not exceed €2,000.00 */
export const DAILY_LIMIT_CENTS: Cents = 200_000

export type TransferCheck =
  | { ok: true }
  | { ok: false; code: 'INSUFFICIENT_FUNDS' | 'DAILY_LIMIT_EXCEEDED'; maxAllowedCents: Cents }

export function remainingDailyLimit(sentTodayCents: Cents): Cents {
  return Math.max(0, DAILY_LIMIT_CENTS - sentTodayCents)
}

/**
 * Business rules for an outgoing transfer.
 * Order matters: balance (BR-04) is checked before the daily limit (BR-05),
 * so a user who has neither money nor limit sees the more fundamental reason.
 */
export function checkTransfer(params: {
  amountCents: Cents
  balanceCents: Cents
  sentTodayCents: Cents
}): TransferCheck {
  const { amountCents, balanceCents, sentTodayCents } = params

  if (amountCents > balanceCents) {
    return { ok: false, code: 'INSUFFICIENT_FUNDS', maxAllowedCents: balanceCents }
  }

  const remaining = remainingDailyLimit(sentTodayCents)
  if (amountCents > remaining) {
    return { ok: false, code: 'DAILY_LIMIT_EXCEEDED', maxAllowedCents: remaining }
  }

  return { ok: true }
}
