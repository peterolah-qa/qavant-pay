// Lab: serves the BUILT API function (netlify/functions/api.mjs) the way netlify.toml does
// (/api/* → /.netlify/functions/api/:splat), so scripts/latency.mjs can measure it locally.
//   node scripts/lab/fn-server.mjs   (port 8888, run from the repo root after scripts/build-functions.mjs)
import http from 'node:http'
import path from 'node:path'

const root = process.argv[2] ?? process.cwd()
const api = (await import(path.join(root, 'netlify/functions/api.mjs'))).default

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost:8888')
    if (!url.pathname.startsWith('/api/')) {
      res.writeHead(404)
      return res.end()
    }
    url.pathname = `/.netlify/functions/api${url.pathname.slice(4)}` // the Netlify rewrite
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)
    const out = await api(new Request(url, { method: req.method, headers: req.headers, body }))
    const headers = {}
    out.headers.forEach((v, k) => (headers[k] = v))
    const cookies = out.headers.getSetCookie?.()
    if (cookies?.length) headers['set-cookie'] = cookies
    res.writeHead(out.status, headers)
    res.end(Buffer.from(await out.arrayBuffer()))
  })
  .listen(8888, () => console.log('API on :8888'))
