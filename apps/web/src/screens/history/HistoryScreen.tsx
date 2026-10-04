// /history?type=income&q=lidl – filter chips, search without diacritics, "Load more" (cursor pagination).
// Filters live in the URL: Back from a detail returns to the same filtered list, and the list is linkable.
import { MAX_QUERY_LENGTH, TX_FILTERS, type Transaction, type TxFilter } from '@qavant-pay/core'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client.ts'
import { dayLabel, formatTime, signedCents } from '../../format.ts'
import { goBack, navigate, replaceQuery } from '../../router.ts'
import { BackIcon, SearchIcon } from '../../icons.tsx'
import styles from './History.module.css'

export const PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 250
const LABELS: Record<TxFilter, string> = { all: 'All', income: 'Income', spending: 'Spending', bills: 'Bills' }

type List =
  | { kind: 'loading' }
  | { kind: 'ready'; items: Transaction[]; nextCursor: string | null; loadingMore: boolean; moreFailed: boolean }
  | { kind: 'error' }

function readFilters(): { type: TxFilter; q: string } {
  const params = new URLSearchParams(window.location.search)
  const type = params.get('type') as TxFilter | null
  return { type: type && TX_FILTERS.includes(type) ? type : 'all', q: (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH) }
}

/** Consecutive transactions of the same day → one group with a heading and the day's net total. */
function groupByDay(items: Transaction[], now: Date) {
  const groups: Array<{ label: string; totalCents: number; items: Transaction[] }> = []
  for (const t of items) {
    const label = dayLabel(t.bookedAt, now)
    const last = groups[groups.length - 1]
    if (last?.label === label) {
      last.items.push(t)
      last.totalCents += t.amountCents
    } else {
      groups.push({ label, totalCents: t.amountCents, items: [t] })
    }
  }
  return groups
}

export function HistoryScreen({ onSessionLost }: { onSessionLost: () => void }) {
  const [initial] = useState(readFilters)
  // "Today"/"Yesterday" are relative to when the screen opened – stable across re-renders
  const [now] = useState(() => new Date())
  const [type, setType] = useState<TxFilter>(initial.type)
  const [input, setInput] = useState(initial.q) // what is in the search box
  const [q, setQ] = useState(initial.q) // what we search for (debounced)
  const [list, setList] = useState<List>({ kind: 'loading' })
  const [retry, setRetry] = useState(0)
  const current = useRef<AbortController | null>(null)

  // typing "lidl" fires one request, not four
  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input])

  // first page whenever the filter or the search changes; an older, slower response can never win
  useEffect(() => {
    const params = new URLSearchParams()
    if (type !== 'all') params.set('type', type)
    if (q) params.set('q', q)
    replaceQuery(params)

    const controller = new AbortController()
    current.current?.abort()
    current.current = controller
    void api.history({ type, q, limit: PAGE_SIZE }, controller.signal).then((res) => {
      if (controller.signal.aborted) return
      if (res.ok) {
        setList({ kind: 'ready', items: res.data.items, nextCursor: res.data.nextCursor, loadingMore: false, moreFailed: false })
      } else if (res.error.status === 401) onSessionLost()
      else setList({ kind: 'error' })
    })
    return () => controller.abort()
  }, [type, q, retry, onSessionLost])

  const loadMore = async () => {
    if (list.kind !== 'ready' || !list.nextCursor || list.loadingMore) return
    const controller = current.current
    setList({ ...list, loadingMore: true, moreFailed: false })
    const res = await api.history({ type, q, limit: PAGE_SIZE, cursor: list.nextCursor }, controller?.signal)
    if (controller?.signal.aborted) return // the filter changed meanwhile
    if (res.ok) {
      setList({
        kind: 'ready',
        items: [...list.items, ...res.data.items],
        nextCursor: res.data.nextCursor,
        loadingMore: false,
        moreFailed: false,
      })
    } else if (res.error.status === 401) onSessionLost()
    else setList({ ...list, loadingMore: false, moreFailed: true })
  }

  const changeType = (next: TxFilter) => {
    if (next === type) return
    setList({ kind: 'loading' })
    setType(next)
  }

  const searching = input.trim() !== q

  return (
    <main className={styles.screen} data-testid="history-screen">
      <header className={styles.header}>
        <button type="button" className={styles.iconButton} aria-label="Back" data-testid="history-back" onClick={() => goBack('/')}>
          <BackIcon />
        </button>
        <h1 className={styles.title}>History</h1>
      </header>

      <div className={styles.search}>
        <SearchIcon />
        <input
          type="search"
          className={styles.searchInput}
          data-testid="history-search"
          aria-label="Search transactions"
          placeholder="Search transactions"
          maxLength={MAX_QUERY_LENGTH}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </div>

      <div className={styles.chips} role="group" aria-label="Filter by type">
        {TX_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`${styles.chip} ${f === type ? styles.chipActive : ''}`}
            data-testid={`history-filter-${f}`}
            aria-pressed={f === type}
            onClick={() => changeType(f)}
          >
            {LABELS[f]}
          </button>
        ))}
      </div>

      <section aria-live="polite" aria-busy={list.kind === 'loading' || searching} className={styles.results}>
        {list.kind === 'loading' && <div className={styles.skeleton} data-testid="history-loading" />}

        {list.kind === 'error' && (
          <div className={styles.empty} data-testid="history-error">
            <p role="alert">Could not load your transactions.</p>
            <button type="button" className="text-button" onClick={() => setRetry((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}

        {list.kind === 'ready' && list.items.length === 0 && (
          <div className={styles.empty} data-testid="history-empty">
            <p className={styles.emptyTitle}>No transactions found</p>
            <p className={styles.muted}>{q ? `Nothing matches “${q}”.` : 'Nothing here yet.'}</p>
          </div>
        )}

        {list.kind === 'ready' &&
          groupByDay(list.items, now).map((group) => (
            <div key={group.label} className={styles.group} data-testid="history-group">
              <h2 className={styles.groupTitle}>
                <span data-testid="history-group-label">{group.label}</span>
                <span className={styles.muted}>{signedCents(group.totalCents)}</span>
              </h2>
              <ul className={styles.list}>
                {group.items.map((t) => (
                  <li key={t.id} data-testid={`history-tx-${t.id}`}>
                    <a
                      href={`/transactions/${t.id}`}
                      className={styles.row}
                      onClick={(e) => {
                        e.preventDefault()
                        navigate(`/transactions/${t.id}`)
                      }}
                    >
                      <span className={styles.initial} aria-hidden="true">
                        {t.name.slice(0, 1)}
                      </span>
                      <span className={styles.rowText}>
                        <span className={styles.rowName}>{t.name}</span>
                        <span className={styles.muted}>
                          {t.category} · {formatTime(t.bookedAt)}
                        </span>
                      </span>
                      <span className={`${styles.amount} ${t.amountCents > 0 ? styles.income : ''}`} data-testid="history-tx-amount">
                        {signedCents(t.amountCents)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        {list.kind === 'ready' && list.moreFailed && (
          <p className={styles.moreError} role="alert" data-testid="history-more-error">
            Could not load more · try again
          </p>
        )}
        {list.kind === 'ready' && list.nextCursor && (
          <button
            type="button"
            className={styles.more}
            data-testid="history-load-more"
            disabled={list.loadingMore}
            onClick={() => void loadMore()}
          >
            {list.loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>
    </main>
  )
}
