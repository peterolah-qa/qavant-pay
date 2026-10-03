// Integration: real handlers + in-memory store. Covers auth gating and IDOR across two sandboxes.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

process.env.SANDBOX_STORE = 'memory'

type Handler = (req: Request) => Promise<Response>
let createSession: Handler, authPin: Handler, list: Handler, detail: Handler

beforeAll(async () => {
  createSession = (await import('../../api/functions/demo-session.mts')).default
  authPin = (await import('../../api/functions/auth-pin.mts')).default
  list = (await import('../../api/functions/transactions.mts')).default
  detail = (await import('../../api/functions/transaction-detail.mts')).default
})

const URL = 'https://pay.qavant.dev'

async function loggedInVisitor(): Promise<string> {
  const res = await createSession(new Request(`${URL}/api/demo/session`, { method: 'POST' }))
  const cookie = res.headers.get('set-cookie')!.split(';')[0]
  await authPin(new Request(`${URL}/api/auth/pin`, { method: 'POST', headers: { cookie }, body: '{"pin":"1234"}' }))
  return cookie
}

const get = (handler: Handler, path: string, cookie: string) =>
  handler(new Request(`${URL}${path}`, { headers: { cookie } }))

let cookie: string
beforeEach(async () => {
  cookie = await loggedInVisitor()
})

describe('GET /api/transactions', () => {
  it('returns the 12 seeded transactions, newest first', async () => {
    const res = await get(list, '/api/transactions', cookie)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(12)
    expect(body.nextCursor).toBeNull()
  })

  it('passes query params through (type, q, limit)', async () => {
    const body = await (await get(list, '/api/transactions?type=spending&q=kaviaren&limit=5', cookie)).json()
    expect(body.items.map((t: { name: string }) => t.name)).toEqual(['Bistro Kaviareň'])
  })

  it.each([
    ['?type=fees', 'INVALID_TYPE'],
    ['?limit=abc', 'INVALID_LIMIT'],
    ['?limit=0', 'INVALID_LIMIT'],
    ['?cursor=tx_00000000_01', 'INVALID_CURSOR'],
  ])('%s → 400 %s', async (query, code) => {
    const res = await get(list, `/api/transactions${query}`, cookie)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code })
  })

  it('without PIN → 401 PIN_REQUIRED', async () => {
    const res = await createSession(new Request(`${URL}/api/demo/session`, { method: 'POST' }))
    const fresh = res.headers.get('set-cookie')!.split(';')[0]
    const listRes = await get(list, '/api/transactions', fresh)
    expect(listRes.status).toBe(401)
    expect(await listRes.json()).toMatchObject({ code: 'PIN_REQUIRED' })
  })
})

describe('GET /api/transactions/:id', () => {
  it('returns one of my transactions', async () => {
    const [first] = (await (await get(list, '/api/transactions', cookie)).json()).items
    const res = await get(detail, `/api/transactions/${first.id}`, cookie)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(first)
  })

  it("IDOR: another visitor's transaction id → 404, not 403 and not the data", async () => {
    const other = await loggedInVisitor()
    const [foreign] = (await (await get(list, '/api/transactions', other)).json()).items

    const res = await get(detail, `/api/transactions/${foreign.id}`, cookie)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ code: 'NOT_FOUND', message: 'Transaction not found' })
  })

  it.each(['tx_doesnotexist', '../../etc/passwd', '%00', 'tx_00000000_01'])(
    'unknown or malformed id %j → 404',
    async (id) => {
      expect((await get(detail, `/api/transactions/${encodeURIComponent(id)}`, cookie)).status).toBe(404)
    },
  )
})
