import { describe, expect, it } from 'vitest'
import { normalizeText, queryTransactions, seedSandbox, type HistoryPage } from '@qavant-pay/core'

const { transactions } = seedSandbox('6282f31c-0c2a-470c-b488-b42e84ba2d7b', new Date('2026-10-03T12:00:00Z'))

const page = (query: Parameters<typeof queryTransactions>[1]): HistoryPage => {
  const result = queryTransactions(transactions, query)
  if (!result.ok) throw new Error(`unexpected ${result.code}`)
  return result.page
}
const names = (p: HistoryPage) => p.items.map((t) => t.name)

describe('filter by type', () => {
  it.each([
    ['all', 12],
    ['income', 4],
    ['spending', 4],
    ['bills', 4],
  ] as const)('%s → %i transactions', (type, count) => {
    const p = page({ type })
    expect(p.items).toHaveLength(count)
    if (type !== 'all') expect(p.items.every((t) => t.type === type)).toBe(true)
  })

  it('income contains only positive amounts', () => {
    expect(page({ type: 'income' }).items.every((t) => t.amountCents > 0)).toBe(true)
  })
})

describe('search (name + category, case- and diacritics-insensitive)', () => {
  it.each([
    ['lidl', ['Lidl']],
    ['LIDL', ['Lidl']],
    ['kaviaren', ['Bistro Kaviareň']], // no háček needed
    ['Kaviareň', ['Bistro Kaviareň']],
    ['groceries', ['Lidl', 'Tesco']], // matches category too
    ['  netflix  ', ['Netflix']], // trimmed
    ['xyz', []],
  ])('%j → %j', (q, expected) => {
    expect(names(page({ q }))).toEqual(expected)
  })

  it('combines with the type filter', () => {
    expect(names(page({ type: 'bills', q: 'subscription' }))).toEqual(['Spotify', 'Netflix'])
  })
})

describe('cursor pagination', () => {
  it('walks all pages without duplicates or gaps, newest first', () => {
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const p = page({ limit: 5, cursor })
      seen.push(...p.items.map((t) => t.id))
      cursor = p.nextCursor
      pages++
    } while (cursor)

    expect(pages).toBe(3) // 5 + 5 + 2
    expect(seen).toEqual(transactions.map((t) => t.id))
  })

  it('exact fit → no next page (boundary)', () => {
    expect(page({ limit: 12 }).nextCursor).toBeNull()
    expect(page({ limit: 11 }).nextCursor).not.toBeNull()
  })
})

describe('invalid queries → stable error codes', () => {
  it.each([
    [{ type: 'fees' as never }, 'INVALID_TYPE'],
    [{ limit: 0 }, 'INVALID_LIMIT'],
    [{ limit: 51 }, 'INVALID_LIMIT'],
    [{ limit: 2.5 }, 'INVALID_LIMIT'],
    [{ limit: Number.NaN }, 'INVALID_LIMIT'],
    [{ q: 'x'.repeat(51) }, 'INVALID_QUERY'],
    [{ cursor: 'tx_00000000_99' }, 'INVALID_CURSOR'],
  ])('%j → %s', (query, code) => {
    expect(queryTransactions(transactions, query)).toEqual({ ok: false, code })
  })

  it.each([1, 50])('limit %i is allowed (boundary)', (limit) => {
    expect(queryTransactions(transactions, { limit }).ok).toBe(true)
  })
})

describe('normalizeText', () => {
  it('strips Slovak diacritics', () => {
    expect(normalizeText('Šťastný Žltý Ďateľ ÔÄ')).toBe('stastny zlty datel oa')
  })
})
