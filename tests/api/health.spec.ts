import { test, expect } from '@playwright/test'

test.describe('API · health', () => {
  // Serverless functions run only on Netlify (deploy preview / production), not in `vite preview`.
  test.skip(({ baseURL }) => !baseURL || baseURL.includes('localhost'), 'API runs on Netlify only')

  test('GET /api/health returns ok @smoke @p1', async ({ request }) => {
    const res = await request.get('/api/health')

    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/json')

    const body = await res.json()
    expect(body).toMatchObject({ status: 'ok', service: 'qavant-pay-api' })
    expect(Number.isNaN(Date.parse(body.time))).toBe(false)
  })
})
