import { formatCents, type Transaction } from '@qavant-pay/core'
import { useEffect, useState, type MouseEvent } from 'react'
import { api, type Account } from '../api/client.ts'
import { formatShortDateTime, signedCents } from '../format.ts'
import { navigate } from '../router.ts'
import styles from './DashboardScreen.module.css'
import { SendIcon } from '../icons.tsx'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; account: Account; recent: Transaction[] }
  | { kind: 'error' }


/** Real links (open in new tab, screen readers) with client-side navigation on a normal click. */
const go = (path: string) => (e: MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault()
  navigate(path)
}

export function DashboardScreen({ onSessionLost }: { onSessionLost: () => void }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    Promise.all([api.account(), api.transactions(4)]).then(([account, recent]) => {
      if (cancelled) return
      if (account.ok && recent.ok) {
        setState({ kind: 'ready', account: account.data, recent: recent.data.items })
      } else if (!account.ok && account.error.status === 401) {
        onSessionLost()
      } else {
        setState({ kind: 'error' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [onSessionLost])

  if (state.kind === 'loading') {
    return (
      <main className={styles.screen} data-testid="dashboard-screen" aria-busy="true">
        <div className={`${styles.card} ${styles.skeleton}`} />
      </main>
    )
  }

  if (state.kind === 'error') {
    return (
      <main className={styles.screen} data-testid="dashboard-screen">
        <p role="alert" data-testid="dashboard-error">
          Could not load your account.
        </p>
      </main>
    )
  }

  const { account, recent } = state
  return (
    <main className={styles.screen} data-testid="dashboard-screen">
      <header className={styles.greeting}>
        <div className={styles.avatar} aria-hidden="true">
          {account.holder.slice(0, 1)}
        </div>
        <div>
          <p className={styles.muted}>Welcome back</p>
          <h1 className={styles.name} data-testid="dashboard-holder">
            {account.holder}
          </h1>
        </div>
      </header>

      <section className={styles.card} aria-label="Main account">
        <div className={styles.cardTop}>
          <span className={styles.muted}>Main account · {account.currency}</span>
          <span className={styles.chip} data-testid="account-iban">
            {account.ibanMasked}
          </span>
        </div>
        <p className={styles.balance} data-testid="balance-amount">
          {formatCents(account.balanceCents)}
        </p>
        <div className={styles.actions}>
          <a href="/transfer" className={styles.action} data-testid="dashboard-send" onClick={go('/transfer')}>
            <SendIcon /> Send
          </a>
        </div>
      </section>

      <section aria-labelledby="recent-heading">
        <div className={styles.sectionHead}>
          <h2 id="recent-heading" className={styles.sectionTitle}>
            Recent
          </h2>
          <a href="/history" className={styles.seeAll} data-testid="dashboard-see-all" onClick={go('/history')}>
            See all
          </a>
        </div>
        <ul className={styles.list}>
          {recent.map((t) => (
            <li key={t.id} data-testid={`recent-tx-${t.id}`}>
              <a href={`/transactions/${t.id}`} className={styles.row} onClick={go(`/transactions/${t.id}`)}>
                <span className={styles.initial} aria-hidden="true">
                  {t.name.slice(0, 1)}
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowName}>{t.name}</span>
                  <span className={styles.muted}>
                    {t.category} · {formatShortDateTime(t.bookedAt)}
                  </span>
                </span>
                <span className={`${styles.amount} ${t.amountCents > 0 ? styles.income : ''}`}>
                  {signedCents(t.amountCents)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
