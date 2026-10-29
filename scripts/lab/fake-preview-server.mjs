// Lab: reproduces a Netlify deploy preview locally (docs/journal.md R.1, R.3).
// Serves the built app (apps/web/dist) and injects a fake "Netlify Drawer" the way the CI log shows the real one:
//   - injected into the page from the SAME origin (blocking netlify.com does not stop it),
//   - a host <div data-netlify-deploy-id …> in the page, the <iframe title="Netlify Drawer"> inside a CLOSED
//     shadow root (page CSS cannot reach it), inline styles with !important, src on app.netlify.com.
// The API is mocked by the tests (mockBank).
//
//   npm run build -w apps/web && node scripts/lab/fake-preview-server.mjs &
//   Chromium args: --no-proxy-server --host-resolver-rules="MAP deploy-preview-71--qavant-pay.test 127.0.0.1"
//   BASE_URL http://deploy-preview-71--qavant-pay.test:4320  (not *.netlify.app: that domain is HSTS-preloaded)
import http from 'node:http'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

const dist = path.join(process.cwd(), 'apps/web/dist')
const port = Number(process.env.PORT ?? 4320)
// SHADOW=closed (default) | open | none – the drawer shapes the fix must survive
const shadow = process.env.SHADOW ?? 'closed'

const DRAWER = `<script>
const SHADOW = '${shadow}';
(() => {
  const host = document.createElement('div')
  host.dataset.vcs = 'github'
  host.dataset.netlifyDeployId = 'lab'
  document.body.append(host)
  const root = SHADOW === 'none' ? host : host.attachShadow({ mode: SHADOW })
  const frame = document.createElement('iframe')
  frame.title = 'Netlify Drawer'
  frame.src = 'https://app.netlify.com/cdp/?deployID=lab'
  frame.setAttribute('style', 'position:fixed!important;left:0!important;bottom:0!important;width:100%!important;' +
    'height:140px!important;border:0!important;z-index:2147483647!important;display:block!important;background:rgba(255,0,0,.25)')
  root.append(frame)
})()
</script>`

const types = {
  '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png',
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://lab')
    const file = path.join(dist, path.normalize(url.pathname))
    try {
      if (url.pathname === '/' || !file.startsWith(dist)) throw new Error('spa')
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      const html = (await readFile(path.join(dist, 'index.html'), 'utf8')).replace('</body>', `${DRAWER}</body>`)
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(html)
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`fake deploy preview with Netlify Drawer on :${port}`))
