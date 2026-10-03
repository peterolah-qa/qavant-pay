// Transaction history: filter, search and cursor pagination as one pure function.
import type { Transaction, TxType } from './seed.ts'

export const TX_FILTERS = ['all', 'income', 'spending', 'bills'] as const
export type TxFilter = (typeof TX_FILTERS)[number]

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50
export const MAX_QUERY_LENGTH = 50

export type HistoryQuery = {
  type?: TxFilter
  q?: string
  limit?: number
  cursor?: string | null
}

export type HistoryPage = { items: Transaction[]; nextCursor: string | null }

export type HistoryResult =
  | { ok: true; page: HistoryPage }
  | { ok: false; code: 'INVALID_TYPE' | 'INVALID_LIMIT' | 'INVALID_QUERY' | 'INVALID_CURSOR' }

/** "Kaviareň" → "kaviaren": lowercase, no diacritics – so Slovak users can search without háčiky. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/** Transactions are stored newest first; the cursor is the id of the last item already shown. */
export function queryTransactions(transactions: Transaction[], query: HistoryQuery = {}): HistoryResult {
  const { type = 'all', q = '', limit = DEFAULT_PAGE_SIZE, cursor = null } = query

  if (!TX_FILTERS.includes(type)) return { ok: false, code: 'INVALID_TYPE' }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) return { ok: false, code: 'INVALID_LIMIT' }
  if (q.length > MAX_QUERY_LENGTH) return { ok: false, code: 'INVALID_QUERY' }

  const needle = normalizeText(q)
  const matches = transactions.filter(
    (t) =>
      (type === 'all' || t.type === (type as TxType)) &&
      (needle === '' || normalizeText(`${t.name} ${t.category}`).includes(needle)),
  )

  let start = 0
  if (cursor) {
    const index = matches.findIndex((t) => t.id === cursor)
    if (index === -1) return { ok: false, code: 'INVALID_CURSOR' }
    start = index + 1
  }

  const items = matches.slice(start, start + limit)
  const hasMore = start + limit < matches.length
  return { ok: true, page: { items, nextCursor: hasMore ? items[items.length - 1].id : null } }
}
