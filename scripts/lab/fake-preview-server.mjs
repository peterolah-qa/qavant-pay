// Lab: reproduces a Netlify deploy preview locally – serves the built app and injects a fake "Netlify Drawer"
// iframe over the bottom of the page, like Netlify does on deploy previews (docs/journal.md R.1).
// Run Chromium with --host-resolver-rules="MAP deploy-preview-71--qavant-pay.test 127.0.0.1" and --no-proxy-server.
// static dist with a FAKE Netlify Drawer injected (like Netlify does on deploy previews); API is mocked by the tests
import http from 'node:http'; import path from 'node:path'; import { readFile } from 'node:fs/promises'
const dist = path.join(process.cwd(), 'apps/web/dist'); const port = 4320
const DRAWER = '<script src="https://app.netlify.com/fake-drawer.js"></script>' +
  '<iframe title="Netlify Drawer" src="https://app.netlify.com/fake-drawer" style="position:fixed;left:0;right:0;bottom:0;height:140px;width:100%;border:0;z-index:2147483647;background:rgba(255,0,0,.3)"></iframe>'
const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const file = path.join(dist, url.pathname)
  try {
    if (url.pathname === '/' ) throw 0
    const d = await readFile(file); res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }); res.end(d)
  } catch {
    const html = (await readFile(path.join(dist, 'index.html'), 'utf8')).replace('</body>', DRAWER + '</body>')
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html)
  }
}).listen(port, '127.0.0.1', () => console.log('preview on', port))
