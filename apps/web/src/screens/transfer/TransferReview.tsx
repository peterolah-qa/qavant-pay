import { formatCents, formatIban, type TransferInput } from '@qavant-pay/core'
import { useRef, useState } from 'react'
import { api, type Account, type ApiError, type TransferReceipt } from '../../api/client.ts'
import { BackIcon, InfoIcon } from './icons.tsx'
import styles from './Transfer.module.css'

type Props = {
  account: Account
  input: TransferInput
  bank: string | null
  idempotencyKey: string
  onEdit: () => void
  onSent: (receipt: TransferReceipt) => void
  onSessionLost: () => void
}

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'rejected'; message: string } // the bank said no → only editing helps
  | { kind: 'retry' } // we do not know if it went through → retry with the SAME key is safe

/** 422 = business rule, the same request would fail again. Everything else may be temporary. */
function rejection(error: ApiError): string | null {
  if (error.status !== 422 && error.status !== 400) return null
  const max = formatCents(error.maxAllowedCents ?? 0)
  switch (error.code) {
    case 'INSUFFICIENT_FUNDS':
      return `Not enough money · available ${max}`
    case 'DAILY_LIMIT_EXCEEDED':
      return `Daily limit reached · you can send ${max} more today`
    case 'SAME_ACCOUNT':
      return 'You cannot send money to your own account'
    default:
      return error.message ?? 'The bank rejected this transfer'
  }
}

export function TransferReview({ account, input, bank, idempotencyKey, onEdit, onSent, onSessionLost }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  // A ref, not state: a double click fires twice before React re-renders the disabled button.
  const inFlight = useRef(false)

  const send = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setStatus({ kind: 'sending' })

    const res = await api.transfer(input, idempotencyKey)
    inFlight.current = false

    if (res.ok) return onSent(res.data)
    if (res.error.status === 401) return onSessionLost()
    const message = rejection(res.error)
    setStatus(message ? { kind: 'rejected', message } : { kind: 'retry' })
  }

  const amount = formatCents(input.amountCents)

  return (
    <main className={styles.screen} data-testid="transfer-review-screen">
      <header className={styles.header}>
        <button type="button" className={styles.iconButton} aria-label="Back to form" onClick={onEdit}>
          <BackIcon />
        </button>
        <h1 className={styles.title}>Review transfer</h1>
      </header>

      <section className={styles.summary} aria-label="Transfer summary">
        <p className={styles.summaryAmount} data-testid="review-amount">
          {amount}
        </p>
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt>To</dt>
            <dd data-testid="review-recipient">{input.recipientName}</dd>
          </div>
          <div className={styles.row}>
            <dt>IBAN</dt>
            <dd>
              <span className={styles.ibanValue} data-testid="review-iban">{formatIban(input.iban)}</span>
              {bank && (
                <span className={styles.rowSub} data-testid="review-bank">
                  {bank}
                </span>
              )}
            </dd>
          </div>
          {input.note && (
            <div className={styles.row}>
              <dt>Note</dt>
              <dd data-testid="review-note">{input.note}</dd>
            </div>
          )}
          <div className={styles.row}>
            <dt>From</dt>
            <dd data-testid="review-from">Main account · {account.ibanMasked}</dd>
          </div>
          <div className={styles.row}>
            <dt>Fee</dt>
            <dd>€0.00</dd>
          </div>
        </dl>
      </section>

      <div className={styles.actions}>
        {status.kind === 'rejected' && (
          <p className={`${styles.banner} ${styles.bannerDanger}`} role="alert" data-testid="review-error">
            <InfoIcon /> {status.message}
          </p>
        )}
        {status.kind === 'retry' && (
          <p className={`${styles.banner} ${styles.bannerWarning}`} role="alert" data-testid="review-error">
            <InfoIcon /> Connection problem · not confirmed yet. Trying again is safe, you will not be charged twice.
          </p>
        )}

        <button
          type="button"
          className={styles.primary}
          data-testid="review-send"
          disabled={status.kind === 'sending' || status.kind === 'rejected'}
          aria-busy={status.kind === 'sending'}
          onClick={() => void send()}
        >
          {status.kind === 'sending' ? 'Sending…' : status.kind === 'retry' ? 'Try again' : `Send ${amount}`}
        </button>
        <button
          type="button"
          className={styles.secondary}
          data-testid="review-edit"
          disabled={status.kind === 'sending'}
          onClick={onEdit}
        >
          Edit transfer
        </button>
      </div>
    </main>
  )
}
