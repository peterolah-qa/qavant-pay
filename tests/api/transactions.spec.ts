import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test'

type Tx = { id: string; name: string; type: string; amountCents: number; bookedAt: string }

async function login(request: APIRequestContext) {
  await request.post('/api/demo/session')
  await request.post('/api/auth/pin', { data: { pin: '1234' } })
}

test.describe('API · transactions', () => {
  test.skip(({ baseURL }) => !baseURL || baseURL.includes('localhost'), 'API runs on Netlify only')

  test('list → 12 seeded transactions, newest first @smoke @p1', async ({ request }) => {
    await login(request)
    const res = await request.get('/api/transactions')

    expect(res.status()).toBe(200)
    const { items, nextCursor } = (await res.json()) as { items: Tx[]; nextCursor: string | null }
    expect(items).toHaveLength(12)
    expect(nextCursor).toBeNull()
    const times = items.map((t) => Date.parse(t.bookedAt))
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  test('filter income → only positive amounts (HIST-01) @p2', async ({ request }) => {
    await login(request)
    const { items } = await (await request.get('/api/transactions', { params: { type: 'income' } })).json()
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((t: Tx) => t.type === 'income' && t.amountCents > 0)).toBe(true)
  })

  test('search without diacritics finds "Kaviareň" (HIST-02) @p2', async ({ request }) => {
    await login(request)
    const { items } = await (await request.get('/api/transactions', { params: { q: 'kaviaren' } })).json()
    expect(items.map((t: Tx) => t.name)).toEqual(['Bistro Kaviareň'])
  })

  test('pagination: 3 pages, no duplicates, nothing missing (HIST-04) @p2', async ({ request }) => {
    await login(request)
    const ids: string[] = []
    let cursor: string | null = null
    do {
      const params: Record<string, string> = { limit: '5', ...(cursor ? { cursor } : {}) }
      const page = await (await request.get('/api/transactions', { params })).json()
      ids.push(...page.items.map((t: Tx) => t.id))
      cursor = page.nextCursor
    } while (cursor)

    expect(ids).toHaveLength(12)
    expect(new Set(ids).size).toBe(12)
  })

  test('detail of my transaction → 200 (DET-01) @p2', async ({ request }) => {
    await login(request)
    const [first] = (await (await request.get('/api/transactions')).json()).items
    const res = await request.get(`/api/transactions/${first.id}`)
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual(first)
  })

  test("IDOR: another visitor's transaction → 404 (API-03) @security @p1", async ({ baseURL }) => {
    const alice = await playwrightRequest.newContext({ baseURL })
    const bob = await playwrightRequest.newContext({ baseURL })
    try {
      await login(alice)
      await login(bob)
      const [bobsTx] = (await (await bob.get('/api/transactions')).json()).items

      const res = await alice.get(`/api/transactions/${bobsTx.id}`)
      expect(res.status()).toBe(404)
      expect(JSON.stringify(await res.json())).not.toContain(bobsTx.name)
    } finally {
      await alice.dispose()
      await bob.dispose()
    }
  })

  test('invalid query → 400 with code (type, limit) @p3', async ({ request }) => {
    await login(request)
    for (const [params, code] of [
      [{ type: 'fees' }, 'INVALID_TYPE'],
      [{ limit: '0' }, 'INVALID_LIMIT'],
    ] as const) {
      const res = await request.get('/api/transactions', { params })
      expect(res.status()).toBe(400)
      expect(await res.json()).toMatchObject({ code })
    }
  })

  test('without PIN → 401 PIN_REQUIRED @p1', async ({ request }) => {
    await request.post('/api/demo/session')
    const res = await request.get('/api/transactions')
    expect(res.status()).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'PIN_REQUIRED' })
  })
})
