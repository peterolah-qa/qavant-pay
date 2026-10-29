#!/usr/bin/env node
// Latency of a real visitor journey, step by step, read from Server-Timing.
//   BASE_URL=https://pay.qavant.dev node scripts/latency.mjs            (5 journeys)
//   BASE_URL=https://pay.qavant.dev RUNS=10 node scripts/latency.mjs
// Each journey is a fresh visitor (new sandbox), exactly what the web app does on first visit.
// Output: per step the client time (p50 / max) plus what the server reports – SQL round trips, DB time,
// connection setup and where the function and the database run.

const BASE = (process.env.BASE_URL ?? 'http://localhost:8888').replace(/\/$/, '')
const RUNS = Number(process.env.RUNS ?? 5)
const VALID_IBAN = 'SK6409000000005123456789'

function parseServerTiming(header) {
  const out = {}
  for (const part of (header ?? '').split(',')) {
    const [name, ...params] = part.trim().split(';')
    if (!name) continue
    const entry = {}
    for (const p of params) {
      const i = p.indexOf('=') // desc="fn=us-east-2 db=…" contains '=' itself
      if (i > 0) entry[p.slice(0, i).trim()] = p.slice(i + 1).replace(/^"|"$/g, '')
    }
    out[name] = entry
  }
  return out
}

async function call(cookie, method, path, body, headers = {}) {
  const start = performance.now()
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie.value ? { cookie: cookie.value } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text() // full body = what the user waits for
  const ms = performance.now() - start
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie.value = setCookie.split(';')[0]
  const st = parseServerTiming(res.headers.get('server-timing'))
  return {
    status: res.status,
    ms,
    queries: Number(/^(\d+)/.exec(st.db?.desc ?? '')?.[1] ?? NaN),
    dbMs: Number(st.db?.dur ?? NaN),
    connectMs: Number(st.connect?.dur ?? NaN),
    where: st.app?.desc ?? '?',
    body: text,
  }
}

async function journey() {
  const cookie = { value: '' }
  const steps = []
  const step = async (name, ...args) => {
    const r = await call(cookie, ...args)
    steps.push({ name, ...r })
    return r
  }
  // exactly what the web app does
  await step('1 app start (session)', 'POST', '/api/session')
  await step('2 PIN (+ dashboard data)', 'POST', '/api/auth/pin', { pin: '1234' })
  await step('3 dashboard later (GET)', 'GET', '/api/dashboard')
  const list = await step('4 history (10)', 'GET', '/api/transactions?limit=10')
  const firstId = JSON.parse(list.body).items?.[0]?.id
  await step('5 detail', 'GET', `/api/transactions/${firstId}`)
  await step('6 transfer', 'POST', '/api/transfers', { recipientName: 'Latency Test', iban: VALID_IBAN, amountCents: 100 }, {
    'Idempotency-Key': crypto.randomUUID(),
  })
  // what the visitor feels: open the page → see the dashboard (PIN typing time excluded)
  const toDashboard = steps[0].ms + steps[1].ms
  return { steps, toDashboard }
}

const pct = (xs, p) => [...xs].sort((x, y) => x - y)[Math.min(xs.length - 1, Math.floor((xs.length - 1) * p))]
const f = (n) => (Number.isFinite(n) ? n.toFixed(0).padStart(6) : '     ?')

const runs = []
for (let i = 0; i < RUNS; i++) runs.push(await journey())

console.log(`\n${BASE} · ${RUNS} fresh visitors · ${runs[0].steps.at(-1).where}\n`)
console.log('step                              status  client p50  client max  SQL trips  db ms p50  connect max')
for (let s = 0; s < runs[0].steps.length; s++) {
  const xs = runs.map((r) => r.steps[s])
  console.log(
    `${xs[0].name.padEnd(34)}${String(xs[0].status).padStart(6)}${f(pct(xs.map((x) => x.ms), 0.5))} ms${f(Math.max(...xs.map((x) => x.ms)))} ms` +
      `${String(xs[0].queries).padStart(11)}${f(pct(xs.map((x) => x.dbMs), 0.5))} ms${f(Math.max(...xs.map((x) => x.connectMs)))} ms`,
  )
}
const td = runs.map((r) => r.toDashboard)
console.log(`\nopen app → dashboard (without PIN typing): p50 ${f(pct(td, 0.5))} ms · max ${f(Math.max(...td))} ms`)
console.log(`first visitor (likely cold): ${f(td[0])} ms\n`)
