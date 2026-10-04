import { test, expect, type APIRequestContext } from '@playwright/test'

const VALID = { recipientName: 'Jana Nováková', iban: 'SK64 0900 0000 0051 2345 6789', amountCents: 1000 }
const START_BALANCE = 428052

const transfer = (request: APIRequestContext, data: unknown, key: string = crypto.randomUUID()) =>
  request.post('/api/transfers', { data, headers: { 'Idempotency-Key': key } })
const balance = async (request: APIRequestContext) => (await (await request.get('/api/account')).json()).balanceCents

test.describe('API · POST /api/transfers', () => {
  test.skip(({ baseURL }) => !baseURL || baseURL.includes('localhost'), 'API runs on Netlify only')

  test.beforeEach(async ({ request }) => {
    await request.post('/api/demo/session')
    await request.post('/api/auth/pin', { data: { pin: '1234' } })
  })

  test('valid transfer → 201, balance decreases, appears first in history (TRF-01) @smoke @p1', async ({ request }) => {
    const res = await transfer(request, { ...VALID, note: 'Rent October' })
    expect(res.status()).toBe(201)

    const { transaction, balanceCents } = await res.json()
    expect(transaction).toMatchObject({
      name: 'Jana Nováková',
      amountCents: -1000,
      category: 'Transfer out',
      counterpartyIban: 'SK6409000000005123456789',
      note: 'Rent October',
    })
    expect(balanceCents).toBe(START_BALANCE - 1000)
    expect(await balance(request)).toBe(START_BALANCE - 1000)
    expect((await (await request.get('/api/transactions')).json()).items[0]).toEqual(transaction)
  })

  test('amount over balance → 422 INSUFFICIENT_FUNDS, nothing booked (TRF-03) @p1', async ({ request }) => {
    const res = await transfer(request, { ...VALID, amountCents: START_BALANCE + 1 })
    expect(res.status()).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'INSUFFICIENT_FUNDS' })
    expect(await balance(request)).toBe(START_BALANCE)
  })

  test('daily limit: €2,000.00 ok, next €0.01 → 422 DAILY_LIMIT_EXCEEDED (TRF-05) @p1', async ({ request }) => {
    expect((await transfer(request, { ...VALID, amountCents: 200000 })).status()).toBe(201)
    const res = await transfer(request, { ...VALID, amountCents: 1 })
    expect(res.status()).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'DAILY_LIMIT_EXCEEDED', maxAllowedCents: 0 })
  })

  test('invalid IBAN checksum → 422 INVALID_IBAN (TRF-02) @p1', async ({ request }) => {
    const res = await transfer(request, { ...VALID, iban: 'SK65 0900 0000 0051 2345 6789' })
    expect(res.status()).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'INVALID_IBAN' })
  })

  test('retry with the same Idempotency-Key → replayed, money moved once (TRF-06) @p1', async ({ request }) => {
    const key = crypto.randomUUID()
    const first = await transfer(request, VALID, key)
    const retry = await transfer(request, VALID, key)

    expect(retry.status()).toBe(201)
    expect(retry.headers()['idempotent-replayed']).toBe('true')
    expect(await retry.json()).toEqual(await first.json())
    expect(await balance(request)).toBe(START_BALANCE - 1000)
  })

  test('double click: 2 parallel requests, same key → exactly one transfer (TRF-06) @p1', async ({ request }) => {
    const key = crypto.randomUUID()
    const [a, b] = await Promise.all([transfer(request, VALID, key), transfer(request, VALID, key)])

    expect((await a.json()).transaction.id).toBe((await b.json()).transaction.id)
    expect(await balance(request)).toBe(START_BALANCE - 1000)
  })

  test('5 parallel transfers, different keys → no lost update, balance exact @p1', async ({ request }) => {
    const results = await Promise.all(Array.from({ length: 5 }, () => transfer(request, VALID)))
    expect(results.map((r) => r.status())).toEqual([201, 201, 201, 201, 201])
    expect(await balance(request)).toBe(START_BALANCE - 5000)
  })

  test('same key, different body → 422 IDEMPOTENCY_KEY_REUSED @p2', async ({ request }) => {
    const key = crypto.randomUUID()
    await transfer(request, VALID, key)
    const res = await transfer(request, { ...VALID, amountCents: 9999 }, key)
    expect(res.status()).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
  })

  test('missing Idempotency-Key → 400 @p2', async ({ request }) => {
    const res = await request.post('/api/transfers', { data: VALID })
    expect(res.status()).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' })
  })

  test('amount as string → 400 INVALID_REQUEST @p2', async ({ request }) => {
    const res = await transfer(request, { ...VALID, amountCents: '10' })
    expect(res.status()).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_REQUEST' })
  })
})

test.describe('API · PIN brute force in parallel @security', () => {
  test.skip(({ baseURL }) => !baseURL || baseURL.includes('localhost'), 'API runs on Netlify only')

  test('5 parallel wrong PINs cannot exceed the 3-attempt limit @p1', async ({ request }) => {
    await request.post('/api/demo/session')
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request.post('/api/auth/pin', { data: { pin: '0000' } })),
    )
    const statuses = responses.map((r) => r.status())

    expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(2)
    expect(statuses.filter((s) => s === 200)).toHaveLength(0)
    expect((await request.post('/api/auth/pin', { data: { pin: '1234' } })).status()).toBe(423)
  })
})
