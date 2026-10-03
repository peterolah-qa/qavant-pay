// Integration: real handlers + in-memory store with real optimistic locking.
// The parallel tests prove that money cannot be spent twice and PIN attempts cannot be raced.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

process.env.SANDBOX_STORE = 'memory'

type Handler = (req: Request) => Promise<Response>
let createSession: Handler, authPin: Handler, transfers: Handler, account: Handler, list: Handler

beforeAll(async () => {
  createSession = (await import('../../api/functions/demo-session.mts')).default
  authPin = (await import('../../api/functions/auth-pin.mts')).default
  transfers = (await import('../../api/functions/transfers.mts')).default
  account = (await import('../../api/functions/account.mts')).default
  list = (await import('../../api/functions/transactions.mts')).default
})

const URL = 'https://pay.qavant.dev'
const VALID = { recipientName: 'Jana Nováková', iban: 'SK64 0900 0000 0051 2345 6789', amountCents: 1000 }
let cookie: string

async function newSession(): Promise<string> {
  const res = await createSession(new Request(`${URL}/api/demo/session`, { method: 'POST' }))
  return res.headers.get('set-cookie')!.split(';')[0]
}
const enterPin = (pin: string, c = cookie) =>
  authPin(new Request(`${URL}/api/auth/pin`, { method: 'POST', headers: { cookie: c }, body: JSON.stringify({ pin }) }))

const send = (body: unknown, key: string | null = crypto.randomUUID()) =>
  transfers(
    new Request(`${URL}/api/transfers`, {
      method: 'POST',
      headers: { cookie, ...(key ? { 'idempotency-key': key } : {}) },
      body: JSON.stringify(body),
    }),
  )
const balance = async () => (await (await account(new Request(`${URL}/api/account`, { headers: { cookie } }))).json()).balanceCents
const history = async () => (await (await list(new Request(`${URL}/api/transactions`, { headers: { cookie } }))).json()).items

beforeEach(async () => {
  cookie = await newSession()
  await enterPin('1234')
})

describe('POST /api/transfers', () => {
  it('201 → balance decreases and the transfer is first in history', async () => {
    const res = await send(VALID)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.balanceCents).toBe(428052 - 1000)
    expect(await balance()).toBe(428052 - 1000)
    expect((await history())[0]).toEqual(body.transaction)
  })

  it.each([
    [{ ...VALID, amountCents: 428053 }, 'INSUFFICIENT_FUNDS'],
    [{ ...VALID, amountCents: 200001 }, 'DAILY_LIMIT_EXCEEDED'],
    [{ ...VALID, iban: 'SK65 0900 0000 0051 2345 6789' }, 'INVALID_IBAN'],
    [{ ...VALID, amountCents: 0 }, 'INVALID_AMOUNT'],
  ])('business rule violated → 422 %#', async (body, code) => {
    const res = await send(body)
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code })
    expect(await balance()).toBe(428052) // nothing was booked
  })

  it('daily limit across two transfers: 2000.00 ok, then 0.01 → 422 with maxAllowedCents 0', async () => {
    expect((await send({ ...VALID, amountCents: 200000 })).status).toBe(201)
    const res = await send({ ...VALID, amountCents: 1 })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'DAILY_LIMIT_EXCEEDED', maxAllowedCents: 0 })
  })

  it.each([
    [{ ...VALID, amountCents: '10' }],
    [{ ...VALID, iban: 123 }],
    [{ recipientName: 'Jana' }],
    [null],
  ])('wrong JSON types → 400 INVALID_REQUEST %#', async (body) => {
    const res = await send(body)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it.each([[null], ['short'], ['has spaces in it'], ['x'.repeat(65)]])(
    'missing or malformed Idempotency-Key %j → 400',
    async (key) => {
      const res = await send(VALID, key)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' })
    },
  )

  it('without PIN → 401 PIN_REQUIRED', async () => {
    cookie = await newSession()
    const res = await send(VALID)
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'PIN_REQUIRED' })
  })
})

describe('idempotency (TRF-06)', () => {
  it('retry with the same key → original response replayed, money moved once', async () => {
    const key = crypto.randomUUID()
    const first = await send(VALID, key)
    const retry = await send(VALID, key)

    expect(retry.status).toBe(201)
    expect(retry.headers.get('idempotent-replayed')).toBe('true')
    expect(await retry.json()).toEqual(await first.json())
    expect(await balance()).toBe(428052 - 1000)
    expect(await history()).toHaveLength(13)
  })

  it('same key, different body → 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const key = crypto.randomUUID()
    await send(VALID, key)
    const res = await send({ ...VALID, amountCents: 9999 }, key)
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
  })

  it('double click: 2 PARALLEL requests with the same key → one transfer', async () => {
    const key = crypto.randomUUID()
    const [a, b] = await Promise.all([send(VALID, key), send(VALID, key)])
    const [bodyA, bodyB] = [await a.json(), await b.json()]

    expect(bodyA.transaction.id).toBe(bodyB.transaction.id)
    expect(await balance()).toBe(428052 - 1000)
    expect(await history()).toHaveLength(13)
  })
})

describe('optimistic locking – no lost updates', () => {
  it('5 PARALLEL transfers with different keys → all 5 booked, balance exact', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => send(VALID)))
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201])
    expect(await balance()).toBe(428052 - 5 * 1000)
    expect(await history()).toHaveLength(17)
  })

  it('PIN race: 5 PARALLEL wrong guesses cannot exceed the 3-attempt limit', async () => {
    cookie = await newSession()
    const statuses = (await Promise.all(Array.from({ length: 5 }, () => enterPin('0000')))).map((r) => r.status)

    expect(statuses.filter((s) => s === 401)).toHaveLength(2) // attempts 1 and 2
    expect(statuses.filter((s) => s === 423)).toHaveLength(3) // locked from attempt 3 on
    expect((await enterPin('1234')).status).toBe(423) // still locked
  })
})
