import {
  DAILY_LIMIT_CENTS,
  NOTE_MAX,
  formatCents,
  formatIban,
  maxTransferCents,
  normalizeIban,
  toAmountInput,
  validateIban,
  validateTransferDraft,
  type DraftErrors,
  type TransferDraft,
  type TransferInput,
} from '@qavant-pay/core'
import { useState, type FormEvent } from 'react'
import { BackIcon, CheckIcon, InfoIcon } from '../../icons.tsx'
import styles from './Transfer.module.css'

type Props = {
  balanceCents: number
  draft: TransferDraft
  onChange: (draft: TransferDraft) => void
  onBack: () => void
  onReview: (input: TransferInput, bank: string | null) => void
}

const IBAN_MESSAGES: Record<NonNullable<DraftErrors['iban']>, string> = {
  EMPTY: "Enter the recipient's IBAN",
  CHARACTERS: 'IBAN can contain only letters and digits',
  COUNTRY: 'Only Slovak (SK) IBANs are supported',
  LENGTH: 'A Slovak IBAN has 24 characters',
  CHECKSUM: 'Invalid IBAN · check digits do not match',
}

const RECIPIENT_MESSAGES: Record<NonNullable<DraftErrors['recipientName']>, string> = {
  TOO_SHORT: "Enter the recipient's name",
  TOO_LONG: 'Name can have at most 70 characters',
}

function amountMessage(error: NonNullable<DraftErrors['amount']>, balanceCents: number): string {
  switch (error) {
    case 'EMPTY':
      return 'Enter an amount'
    case 'FORMAT':
      return 'Enter an amount like 25.50'
    case 'PRECISION':
      return 'Use at most 2 decimal places'
    case 'NOT_POSITIVE':
      return 'Amount must be at least €0.01'
    case 'TOO_LARGE':
    case 'INSUFFICIENT_FUNDS':
      return `Exceeds available balance of ${formatCents(balanceCents)}`
    case 'DAILY_LIMIT_EXCEEDED':
      return `Exceeds the daily limit of ${formatCents(DAILY_LIMIT_CENTS)}`
  }
}

const QUICK_AMOUNTS = [5_000, 10_000, 50_000]

export function TransferForm({ balanceCents, draft, onChange, onBack, onReview }: Props) {
  const [touched, setTouched] = useState({ recipientName: false, iban: false, amount: false })
  const result = validateTransferDraft(draft, balanceCents)
  const { errors } = result
  const ibanCheck = validateIban(draft.iban) // shown on its own, before the rest of the form is filled

  const set = (field: keyof TransferDraft) => (value: string) => onChange({ ...draft, [field]: value })
  const touch = (field: keyof typeof touched) => () => setTouched((t) => ({ ...t, [field]: true }))

  // Errors appear when they help, not while the user is still typing the first character.
  const recipientError = touched.recipientName ? errors.recipientName : undefined
  const ibanComplete = normalizeIban(draft.iban).length >= 24
  const ibanError = touched.iban || ibanComplete ? errors.iban : undefined
  const amountError = draft.amount !== '' || touched.amount ? errors.amount : undefined

  const formatIbanOnBlur = () => {
    touch('iban')()
    if (/^[A-Za-z0-9\s]+$/.test(draft.iban)) set('iban')(formatIban(normalizeIban(draft.iban)))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (result.ok) onReview(result.input, result.bank)
    else setTouched({ recipientName: true, iban: true, amount: true })
  }

  return (
    <main className={styles.screen} data-testid="transfer-screen">
      <header className={styles.header}>
        <button type="button" className={styles.iconButton} aria-label="Back" data-testid="transfer-back" onClick={onBack}>
          <BackIcon />
        </button>
        <h1 className={styles.title}>New transfer</h1>
      </header>

      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="recipient">
            Recipient name
          </label>
          <input
            id="recipient"
            className={styles.input}
            data-testid="transfer-recipient"
            autoComplete="name"
            maxLength={70}
            value={draft.recipientName}
            aria-invalid={!!recipientError}
            aria-describedby={recipientError ? 'recipient-error' : undefined}
            onChange={(e) => set('recipientName')(e.target.value)}
            onBlur={touch('recipientName')}
          />
          {recipientError && (
            <p id="recipient-error" className={styles.error} data-testid="transfer-recipient-error">
              <InfoIcon /> {RECIPIENT_MESSAGES[recipientError]}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="iban">
            IBAN
          </label>
          <div className={styles.inputWrap}>
            <input
              id="iban"
              className={`${styles.input} ${styles.ibanInput} ${!errors.iban ? styles.valid : ''} ${ibanError ? styles.invalid : ''}`}
              data-testid="transfer-iban"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="SK00 0000 0000 0000 0000 0000"
              value={draft.iban}
              aria-invalid={!!ibanError}
              aria-describedby="iban-status"
              onChange={(e) => set('iban')(e.target.value)}
              onBlur={formatIbanOnBlur}
            />
            {!errors.iban && (
              <span className={styles.inputIcon}>
                <CheckIcon />
              </span>
            )}
          </div>
          <p id="iban-status" aria-live="polite" className={styles.status}>
            {!errors.iban && (
              <span className={styles.ok} data-testid="transfer-iban-status" data-valid="true">
                Valid IBAN{ibanCheck.valid && ibanCheck.bank ? ` · ${ibanCheck.bank}` : ''}
              </span>
            )}
            {ibanError && (
              <span className={styles.error} data-testid="transfer-iban-status" data-valid="false">
                <InfoIcon /> {IBAN_MESSAGES[ibanError]}
              </span>
            )}
          </p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="amount">
            Amount
          </label>
          <div className={styles.inputWrap}>
            <span className={styles.currency} aria-hidden="true">
              €
            </span>
            <input
              id="amount"
              className={`${styles.input} ${styles.amountInput} ${amountError ? styles.invalid : ''}`}
              data-testid="transfer-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={draft.amount}
              aria-invalid={!!amountError}
              aria-describedby="amount-status"
              onChange={(e) => set('amount')(e.target.value)}
              onBlur={touch('amount')}
            />
          </div>
          <p id="amount-status" aria-live="polite" className={styles.status}>
            {amountError ? (
              <span className={styles.error} data-testid="transfer-amount-error">
                <InfoIcon /> {amountMessage(amountError, balanceCents)}
              </span>
            ) : (
              <span className={styles.hint} data-testid="transfer-amount-hint">
                Available {formatCents(balanceCents)}
              </span>
            )}
          </p>
          <div className={styles.quick}>
            {QUICK_AMOUNTS.map((cents) => (
              <button
                key={cents}
                type="button"
                className={styles.quickButton}
                data-testid={`transfer-quick-${cents / 100}`}
                onClick={() => set('amount')(toAmountInput(cents))}
              >
                {formatCents(cents).replace('.00', '')}
              </button>
            ))}
            <button
              type="button"
              className={styles.quickButton}
              data-testid="transfer-quick-max"
              onClick={() => set('amount')(toAmountInput(maxTransferCents(balanceCents)))}
            >
              Max
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="note">
            Note <span className={styles.optional}>(optional)</span>
          </label>
          <input
            id="note"
            className={styles.input}
            data-testid="transfer-note"
            maxLength={NOTE_MAX}
            value={draft.note}
            onChange={(e) => set('note')(e.target.value)}
          />
          <p className={`${styles.status} ${styles.counter}`} data-testid="transfer-note-count">
            {draft.note.length}/{NOTE_MAX}
          </p>
        </div>

        <button type="submit" className={styles.primary} data-testid="transfer-review" disabled={!result.ok}>
          Review transfer
        </button>
      </form>
    </main>
  )
}
