import { describe, expect, it } from 'vitest'
import { dbRegion, recordQuery, serverTimingHeader, withTiming } from '../../api/lib/timing.ts'

describe('Server-Timing', () => {
  it('reports only the region of the database host, never the endpoint id', () => {
    expect(dbRegion('postgres://u:p@ep-cool-name-123-pooler.eu-central-1.aws.neon.tech/db?sslmode=require')).toBe('eu-central-1')
    expect(dbRegion('postgres://u:p@ep-x.us-east-2.aws.neon.tech/db')).toBe('us-east-2')
    expect(dbRegion('postgres://qp@localhost:5433/qavant_test')).toBe('local')
    expect(dbRegion('')).toBe('none') // no DATABASE_URL configured
  })

  it('formats db time, query count, connect time and where the code ran', () => {
    expect(serverTimingHeader({ queries: 3, dbMs: 212.44, connectMs: 0 }, 231, false)).toMatch(
      /^db;dur=212\.4;desc="3 queries", connect;dur=0\.0, app;dur=231\.0;desc="fn=\S+ db=\S+ warm"$/,
    )
    expect(serverTimingHeader({ queries: 1, dbMs: 1, connectMs: 0 }, 2, true)).toContain('desc="1 query"')
  })

  it('counts the queries of THIS request only, also when requests run in parallel', async () => {
    const handler = withTiming(async (req) => {
      const n = Number(new URL(req.url).searchParams.get('n'))
      for (let i = 0; i < n; i++) {
        await new Promise((r) => setTimeout(r, 1))
        recordQuery(1)
      }
      return Response.json({ ok: true }, { headers: { 'x-keep': 'me' } })
    })
    const [a, b] = await Promise.all([handler(new Request('http://x/?n=2')), handler(new Request('http://x/?n=5'))])
    expect(a.headers.get('server-timing')).toContain('desc="2 queries"')
    expect(b.headers.get('server-timing')).toContain('desc="5 queries"')
    expect(a.headers.get('x-keep')).toBe('me') // original headers survive
    expect(await a.json()).toEqual({ ok: true }) // body untouched
  })

  it('every API response carries the header (contract)', async () => {
    const api = (await import('../../api/functions/api.mts')).default
    const res = await api(new Request('http://x/api/health'))
    expect(res.headers.get('server-timing')).toMatch(/db;dur=0\.0;desc="0 queries"/)
  })
})
