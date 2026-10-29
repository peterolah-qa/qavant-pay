// Server-Timing for every API response: how long the function took, how much of it was the database,
// how many SQL round trips it needed, and where it ran. Visible in DevTools → Network → Timing,
// and machine-readable for scripts/latency.mjs and the API performance tests.
//
//   Server-Timing: db;dur=212.4;desc="3 queries", connect;dur=0.0, app;dur=231.0;desc="fn=us-east-2 db=eu-central-1 warm"
//
// AsyncLocalStorage keeps the numbers per request, even when tests run handlers in parallel.
import { AsyncLocalStorage } from 'node:async_hooks'

type Timing = { queries: number; dbMs: number; connectMs: number }

const current = new AsyncLocalStorage<Timing>()
let coldStart = true // module scope survives between invocations of a warm instance

export function recordQuery(ms: number) {
  const t = current.getStore()
  if (!t) return
  t.queries += 1
  t.dbMs += ms
}

export function recordConnect(ms: number) {
  const t = current.getStore()
  if (t) t.connectMs += ms
}

/** "ep-x-pooler.eu-central-1.aws.neon.tech" → "eu-central-1" (only the region, never the endpoint id). */
export function dbRegion(url = process.env.DATABASE_URL): string {
  if (!url) return 'none'
  const host = /@([^/:?]+)/.exec(url)?.[1] ?? ''
  if (host === 'localhost' || host === '127.0.0.1') return 'local'
  return /\.([a-z]{2}-[a-z]+-\d)\./.exec(host)?.[1] ?? 'unknown'
}

export function serverTimingHeader(t: Timing, totalMs: number, cold: boolean): string {
  const where = `fn=${process.env.AWS_REGION ?? 'local'} db=${dbRegion()} ${cold ? 'cold' : 'warm'}`
  return [
    `db;dur=${t.dbMs.toFixed(1)};desc="${t.queries} ${t.queries === 1 ? 'query' : 'queries'}"`,
    `connect;dur=${t.connectMs.toFixed(1)}`,
    `app;dur=${totalMs.toFixed(1)};desc="${where}"`,
  ].join(', ')
}

/** Wraps a Netlify function: measures it and adds the Server-Timing header to its response. */
export function withTiming(
  handler: (req: Request) => Response | Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const cold = coldStart
    coldStart = false
    const timing: Timing = { queries: 0, dbMs: 0, connectMs: 0 }
    const start = performance.now()
    const res = await current.run(timing, () => handler(req))

    const headers = new Headers(res.headers) // response headers can be immutable → copy
    headers.set('Server-Timing', serverTimingHeader(timing, performance.now() - start, cold))
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  }
}
