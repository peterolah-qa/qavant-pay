// Outgoing SEPA-style transfer as a pure function: validate → check limits → build new state.
// Nothing is mutated; the caller decides whether to persist the result.
import { checkTransfer } from './limits.ts'
import { MAX_AMOUNT_CENTS, type Cents } from './money.ts'
import { validateIban } from './iban.ts'
import type { Account, Transaction } from './seed.ts'

export const TRANSFER_OUT_CATEGORY = 'Transfer out'
export const RECIPIENT_MIN = 2
export const RECIPIENT_MAX = 70
export const NOTE_MAX = 140
export const BANK_TIME_ZONE = 'Europe/Bratislava'

export type TransferInput = {
  recipientName: string
  iban: string
  amountCents: number
  note?: string
}

export type TransferErrorCode =
  | 'INVALID_RECIPIENT'
  | 'INVALID_IBAN'
  | 'INVALID_AMOUNT'
  | 'INVALID_NOTE'
  | 'SAME_ACCOUNT'
  | 'INSUFFICIENT_FUNDS'
  | 'DAILY_LIMIT_EXCEEDED'

export type TransferResult =
  | { ok: true; transaction: Transaction; account: Account; transactions: Transaction[] }
  | { ok: false; code: TransferErrorCode; maxAllowedCents?: Cents }

/** Calendar day in the bank's time zone: 2026-10-03T22:30Z is already "2026-10-04" in Bratislava (CEST). */
export function localDay(date: Date, timeZone = BANK_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** Sum of outgoing transfers booked today (bank time zone). Card payments do not count. */
export function sentTodayCents(transactions: Transaction[], now: Date): Cents {
  const today = localDay(now)
  return transactions
    .filter((t) => t.category === TRANSFER_OUT_CATEGORY && localDay(new Date(t.bookedAt)) === today)
    .reduce((sum, t) => sum - t.amountCents, 0)
}

function nextTransactionId(transactions: Transaction[]): string {
  const [prefix] = transactions[0]?.id.match(/^tx_[0-9a-f]{8}/) ?? ['tx_00000000']
  const max = Math.max(0, ...transactions.map((t) => Number(t.id.split('_')[2]) || 0))
  return `${prefix}_${String(max + 1).padStart(2, '0')}`
}

export function executeTransfer(
  state: { account: Account; transactions: Transaction[] },
  input: TransferInput,
  now: Date,
): TransferResult {
  const recipientName = input.recipientName.trim()
  if (recipientName.length < RECIPIENT_MIN || recipientName.length > RECIPIENT_MAX) {
    return { ok: false, code: 'INVALID_RECIPIENT' }
  }

  const iban = validateIban(input.iban)
  if (!iban.valid) return { ok: false, code: 'INVALID_IBAN' }
  if (iban.iban === state.account.iban) return { ok: false, code: 'SAME_ACCOUNT' }

  const { amountCents } = input
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
    return { ok: false, code: 'INVALID_AMOUNT' }
  }

  const note = input.note?.trim() ?? ''
  if (note.length > NOTE_MAX) return { ok: false, code: 'INVALID_NOTE' }

  const check = checkTransfer({
    amountCents,
    balanceCents: state.account.balanceCents,
    sentTodayCents: sentTodayCents(state.transactions, now),
  })
  if (!check.ok) return { ok: false, code: check.code, maxAllowedCents: check.maxAllowedCents }

  const transaction: Transaction = {
    id: nextTransactionId(state.transactions),
    name: recipientName,
    type: 'spending',
    category: TRANSFER_OUT_CATEGORY,
    amountCents: -amountCents,
    bookedAt: now.toISOString(),
    status: 'COMPLETED',
    counterpartyIban: iban.iban,
    ...(note ? { note } : {}),
  }

  return {
    ok: true,
    transaction,
    account: { ...state.account, balanceCents: state.account.balanceCents - amountCents },
    transactions: [transaction, ...state.transactions],
  }
}
