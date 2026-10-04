// Validation of the transfer FORM (raw strings typed by the user), shared by the web app.
// Same rules as executeTransfer on the server, so the UI can say "no" before the request is sent.
// The server still checks everything again: the browser is never trusted.
import { validateIban, type IbanError } from './iban.ts'
import { DAILY_LIMIT_CENTS } from './limits.ts'
import { parseAmount, type AmountError, type Cents } from './money.ts'
import { NOTE_MAX, RECIPIENT_MAX, RECIPIENT_MIN, type TransferInput } from './transfer.ts'

export type TransferDraft = { recipientName: string; iban: string; amount: string; note: string }

export type DraftErrors = {
  recipientName?: 'TOO_SHORT' | 'TOO_LONG'
  iban?: IbanError
  amount?: AmountError | 'INSUFFICIENT_FUNDS' | 'DAILY_LIMIT_EXCEEDED'
  note?: 'TOO_LONG'
}

export type DraftResult =
  | { ok: true; input: TransferInput; bank: string | null; errors: DraftErrors }
  | { ok: false; errors: DraftErrors }

export const EMPTY_DRAFT: TransferDraft = { recipientName: '', iban: '', amount: '', note: '' }

/** Largest amount a single transfer may have: the balance, capped by the daily limit. */
export function maxTransferCents(balanceCents: Cents): Cents {
  return Math.max(0, Math.min(balanceCents, DAILY_LIMIT_CENTS))
}

/** 200000 → "2000.00" – the value we put into the amount field (quick amounts, Max). */
export function toAmountInput(cents: Cents): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

/**
 * Checks every field and returns ALL errors at once (the form shows them per field).
 * Order of the amount checks mirrors checkTransfer: balance (BR-04) before the daily limit (BR-05).
 * The daily limit here is the per-transfer maximum; what was already sent today is known only to the server.
 */
export function validateTransferDraft(draft: TransferDraft, balanceCents: Cents): DraftResult {
  const errors: DraftErrors = {}

  const recipientName = draft.recipientName.trim()
  if (recipientName.length < RECIPIENT_MIN) errors.recipientName = 'TOO_SHORT'
  else if (recipientName.length > RECIPIENT_MAX) errors.recipientName = 'TOO_LONG'

  const iban = validateIban(draft.iban)
  if (!iban.valid) errors.iban = iban.reason

  const amount = parseAmount(draft.amount)
  if (!amount.ok) errors.amount = amount.reason
  else if (amount.cents > balanceCents) errors.amount = 'INSUFFICIENT_FUNDS'
  else if (amount.cents > DAILY_LIMIT_CENTS) errors.amount = 'DAILY_LIMIT_EXCEEDED'

  const note = draft.note.trim()
  if (note.length > NOTE_MAX) errors.note = 'TOO_LONG'

  if (Object.keys(errors).length > 0 || !iban.valid || !amount.ok) return { ok: false, errors }

  return {
    ok: true,
    errors,
    bank: iban.bank,
    input: { recipientName, iban: iban.iban, amountCents: amount.cents, ...(note ? { note } : {}) },
  }
}
