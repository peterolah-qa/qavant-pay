// Performance budget: the exact number of SQL round trips per endpoint, read from Server-Timing.
// A round-trip count is deterministic – unlike a millisecond limit it cannot be flaky – and it is what
// made production slow: 16 round trips × 100 ms to create a sandbox (docs/performance.md).
// Raise a number here only on purpose, in review, with a reason.
import pg from 'pg'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const POSTGRES = process.env.SANDBOX_STORE === 'postgres'

type Handler = (req: Request) => Promise<Response>
let api: Handler
beforeAll(async () => {
  api = (await import('../../api/functions/api.mts')).default
})

afterEach(() => vi.restoreAllMocks()) // a failing test must not leave its pg spy behind for the next one

const URL = 'https://pay.qavant.dev'
const sqlTrips = (res: Response) => Number(/db;dur=[\d.]+;desc="(\d+) quer/.exec(res.headers.get('server-timing') ?? '')?.[1])

async function call(method: string, path: string, cookie = '', body?: unknown, headers: Record<string, string> = {}) {
  const res = await api(
    new Request(URL + path, {
      method,
      headers: { cookie, 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
  return { res, trips: sqlTrips(res), cookie: res.headers.get('set-cookie')?.split(';')[0] ?? cookie }
}

describe.skipIf(!POSTGRES)('performance budget – SQL round trips per request (Postgres)', () => {
  it('a whole visitor journey stays within budget', async () => {
    const start = await call('POST', '/api/session')
    expect(start.res.status).toBe(201)
    expect(start.trips, 'new visitor: create sandbox + 12 seed transactions').toBe(1) // was 16
    const cookie = start.cookie

    const again = await call('POST', '/api/session', cookie)
    expect(again.res.status).toBe(200)
    expect(again.trips, 'returning visitor before PIN').toBe(1)

    const pin = await call('POST', '/api/auth/pin', cookie, { pin: '1234' })
    expect(pin.res.status).toBe(200)
    expect(pin.trips, 'PIN: BEGIN+lock, load, write, COMMIT').toBe(4) // was 7
    expect((await pin.res.json()).dashboard.recent).toHaveLength(4) // dashboard data rides along

    for (const path of ['/api/dashboard', '/api/account', '/api/transactions?limit=10']) {
      const r = await call('GET', path, cookie)
      expect(r.res.status, path).toBe(200)
      expect(r.trips, path).toBe(1) // was 3
    }

    const list = await (await call('GET', '/api/transactions?limit=1', cookie)).res.json()
    const detail = await call('GET', `/api/transactions/${list.items[0].id}`, cookie)
    expect(detail.res.status).toBe(200)
    expect(detail.trips, 'detail').toBe(1) // was 3

    const transfer = await call(
      'POST',
      '/api/transfers',
      cookie,
      { recipientName: 'Budget Test', iban: 'SK6409000000005123456789', amountCents: 100 },
      { 'Idempotency-Key': crypto.randomUUID() },
    )
    expect(transfer.res.status).toBe(201)
    expect(transfer.trips, 'transfer: BEGIN+lock, load, write, COMMIT').toBe(4) // was 9
  })

  it('a pooled connection that died while the instance was frozen is replaced transparently', async () => {
    // A frozen Netlify instance only notices on the NEXT request that the database closed its idle
    // connection: the first query fails with "Connection terminated unexpectedly". Simulated exactly:
    const dead = {
      query: vi.fn().mockRejectedValue(new Error('Connection terminated unexpectedly')),
      release: vi.fn(),
    }
    const connect = vi.spyOn(pg.Pool.prototype, 'connect')
    connect.mockResolvedValueOnce(dead as never) // first connection from the pool is the dead one

    const res = await call('POST', '/api/session') // nothing reached the database → retried once
    connect.mockRestore()

    expect(res.res.status).toBe(201)
    expect(dead.release).toHaveBeenCalledWith(true) // the dead connection is destroyed, not reused
  })

  it('a connection that dies AFTER the database did work is NOT retried (no double write)', async () => {
    const { cookie } = await call('POST', '/api/session')
    let calls = 0
    const realConnect = pg.Pool.prototype.connect
    const connect = vi.spyOn(pg.Pool.prototype, 'connect').mockImplementation(async function (this: pg.Pool) {
      const client = await (realConnect as () => Promise<pg.PoolClient>).call(this)
      const query = client.query.bind(client) as (text: string, values?: unknown[]) => Promise<pg.QueryResult>
      // BEGIN + lock succeeds, then the connection "dies" during the load
      ;(client as unknown as { query: typeof query }).query = async (text, values) => {
        calls += 1
        if (calls === 2) throw new Error('Connection terminated unexpectedly')
        return query(text, values)
      }
      return client
    })

    const pin = await call('POST', '/api/auth/pin', cookie, { pin: '1234' })
    const connections = connect.mock.calls.length // read before mockRestore() resets it
    connect.mockRestore()

    expect(pin.res.status).toBe(503) // STORE_UNAVAILABLE – honest failure, the client may retry
    expect(connections).toBe(1) // no automatic second attempt
  })
})
