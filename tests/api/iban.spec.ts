import { test, expect } from '@playwright/test'

const ENDPOINT = '/api/iban/validate'

test.describe('API · POST /api/iban/validate', () => {
  test.skip(({ baseURL }) => !baseURL || baseURL.includes('localhost'), 'API runs on Netlify only')

  test('valid IBAN → 200 with normalized IBAN and bank name @smoke @p1', async ({ request }) => {
    const res = await request.post(ENDPOINT, { data: { iban: 'sk64 0900 0000 0051 2345 6789' } })

    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/json')
    expect(await res.json()).toEqual({
      valid: true,
      iban: 'SK6409000000005123456789',
      formatted: 'SK64 0900 0000 0051 2345 6789',
      bankCode: '0900',
      bank: 'Slovenská sporiteľňa',
    })
  })

  // An invalid IBAN is a successful *validation*, not a failed request → 200, valid: false.
  for (const [iban, reason] of [
    ['SK65 0900 0000 0051 2345 6789', 'CHECKSUM'],
    ['SK64 0900 0000 0051 2345 678', 'LENGTH'],
    ['CZ6508000000192000145399', 'COUNTRY'],
  ] as const) {
    test(`${reason}: ${iban} → 200, valid=false @p1`, async ({ request }) => {
      const res = await request.post(ENDPOINT, { data: { iban } })
      expect(res.status()).toBe(200)
      expect(await res.json()).toEqual({ valid: false, reason })
    })
  }

  test.describe('bad requests → 4xx with a stable error code', () => {
    test('malformed JSON → 400 INVALID_JSON @p2', async ({ request }) => {
      const res = await request.post(ENDPOINT, {
        data: Buffer.from('{oops'), // Buffer is sent raw; a plain string would be JSON-encoded
        headers: { 'content-type': 'application/json' },
      })
      expect(res.status()).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'INVALID_JSON' })
    })

    for (const [name, data] of [
      ['missing iban', {}],
      ['iban is a number', { iban: 123 }],
      ['iban longer than 64 chars', { iban: 'S'.repeat(65) }],
    ] as const) {
      test(`${name} → 400 INVALID_REQUEST @p2`, async ({ request }) => {
        const res = await request.post(ENDPOINT, { data })
        expect(res.status()).toBe(400)
        expect(await res.json()).toMatchObject({ code: 'INVALID_REQUEST' })
      })
    }

    test('GET → 405 with Allow: POST @p3', async ({ request }) => {
      const res = await request.get(ENDPOINT)
      expect(res.status()).toBe(405)
      expect(res.headers()['allow']).toBe('POST')
    })
  })
})
