// /transactions/:id – one transaction. Unknown or someone else's id → the server says 404 → "not found" screen.
import { formatIban, type Transaction } from '@qavant-pay/core'
import { useEffect, useState } from 'react'
import { api } from '../../api/client.ts'
import { formatFullDateTime, signedCents } from '../../format.ts'
import { BackIcon } from '../../icons.tsx'
import { goBack } from '../../router.ts'
import { NotFoundScreen } from '../NotFoundScreen.tsx'
import styles from './Detail.module.css'

type State = { kind: 'loading' } | { kind: 'ready'; tx: Transaction } | { kind: 'not-found' } | { kind: 'error' }

/** Same shape the server accepts (api/functions/transaction-detail.mts) – anything else is not even requested. */
const TX_ID = /^tx_[0-9a-f]{8}_\d{2,}$/

export function TransactionDetailScreen({ id, onSessionLost }: { id: string; onSessionLost: () => void }) {
  const validId = TX_ID.test(id)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!validId) return
    let cancelled = false
    void api.transaction(id).then((res) => {
      if (cancelled) return
      if (res.ok) setState({ kind: 'ready', tx: res.data })
      else if (res.error.status === 404) setState({ kind: 'not-found' })
      else if (res.error.status === 401) onSessionLost()
      else setState({ kind: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [id, validId, retry, onSessionLost])

  if (!validId || state.kind === 'not-found') {
    return <NotFoundScreen title="Transaction not found" text="It does not exist or it is not yours." />
  }

  const header = (
    <header className={styles.header}>
      <button type="button" className={styles.iconButton} aria-label="Back" data-testid="detail-back" onClick={() => goBack('/history')}>
        <BackIcon />
      </button>
      <h1 className={styles.title}>Transaction</h1>
    </header>
  )

  if (state.kind !== 'ready') {
    return (
      <main className={styles.screen} data-testid="detail-screen" aria-busy={state.kind === 'loading'}>
        {header}
        {state.kind === 'loading' && <div className={styles.skeleton} />}
        {state.kind === 'error' && (
          <div className={styles.center} data-testid="detail-error">
            <p role="alert">Could not load this transaction.</p>
            <button type="button" className="text-button" onClick={() => setRetry((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}
      </main>
    )
  }

  const { tx } = state
  const incoming = tx.amountCents > 0
  const rows: Array<[label: string, value: string, testId: string]> = [
    ['Date', formatFullDateTime(tx.bookedAt), 'detail-date'],
    ['Category', tx.category, 'detail-category'],
    ...(tx.counterpartyIban
      ? [[incoming ? 'From IBAN' : 'To IBAN', formatIban(tx.counterpartyIban), 'detail-iban'] as [string, string, string]]
      : []),
    ...(tx.note ? [['Note', tx.note, 'detail-note'] as [string, string, string]] : []),
    ['Transaction ID', tx.id, 'detail-id'],
  ]

  return (
    <main className={styles.screen} data-testid="detail-screen">
      {header}

      <section className={styles.hero}>
        <div className={styles.avatar} aria-hidden="true">
          {tx.name.slice(0, 1)}
        </div>
        <p className={styles.name} data-testid="detail-name">
          {tx.name}
        </p>
        <p className={`${styles.amount} ${incoming ? styles.income : ''}`} data-testid="detail-amount">
          {signedCents(tx.amountCents)}
        </p>
        <span className={styles.status} data-testid="detail-status">
          {tx.status === 'COMPLETED' ? 'Completed' : tx.status}
        </span>
      </section>

      <dl className={styles.rows}>
        {rows.map(([label, value, testId]) => (
          <div key={label} className={styles.row}>
            <dt>{label}</dt>
            <dd data-testid={testId}>{value}</dd>
          </div>
        ))}
      </dl>
    </main>
  )
}
