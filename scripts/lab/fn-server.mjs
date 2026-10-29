// Lab: serves the BUILT Netlify functions (netlify/functions/*.mjs) with the routing of netlify.toml,
// so scripts/latency.mjs can measure them locally.   node scripts/lab/fn-server.mjs  (port 8888)
import http from 'node:http'
import path from 'node:path'
const root = process.argv[2] ?? process.cwd()
const fns = {}
const fn = async (n) => (fns[n] ??= (await import(path.join(root, `netlify/functions/${n}.mjs`))).default)
function route(p) {
  const fixed = { '/api/iban/validate': 'iban-validate', '/api/demo/session': 'demo-session', '/api/auth/pin': 'auth-pin' }
  if (fixed[p]) return [fixed[p], '']
  let m = /^\/api\/transactions\/([^/]+)$/.exec(p); if (m) return ['transaction-detail', `id=${m[1]}`]
  m = /^\/api\/(.+)$/.exec(p); if (m) return [m[1], '']
  return null
}
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:8888')
  const r = route(url.pathname)
  if (!r) { res.writeHead(404); return res.end() }
  const chunks = []; for await (const c of req) chunks.push(c)
  if (r[1]) url.search = (url.search ? url.search + '&' : '?') + r[1]
  const out = await (await fn(r[0]))(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }))
  const h = {}; out.headers.forEach((v, k) => { h[k] = v }); const sc = out.headers.getSetCookie?.(); if (sc?.length) h['set-cookie'] = sc
  res.writeHead(out.status, h); res.end(Buffer.from(await out.arrayBuffer()))
}).listen(8888, () => console.log('functions on :8888'))
