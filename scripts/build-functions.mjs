// Bundles every API function (api/functions/*.mts) into ONE self-contained .mjs file
// in netlify/functions/, including code imported from @qavant-pay/core.
// Netlify then deploys plain JavaScript with no imports to resolve → no "Cannot find module".
import { build } from 'esbuild'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'

const SRC = 'api/functions'
const OUT = 'netlify/functions'

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const entryPoints = readdirSync(SRC)
  .filter((file) => file.endsWith('.mts'))
  .map((file) => `${SRC}/${file}`)

await build({
  entryPoints,
  outdir: OUT,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'info',
})
