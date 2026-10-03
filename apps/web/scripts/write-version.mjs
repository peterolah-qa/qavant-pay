// Writes dist/version.json so CI can wait until the deploy preview serves the exact commit under test.
// COMMIT_REF and CONTEXT are set by Netlify during the build; locally they fall back to "local".
import { writeFileSync } from 'node:fs'

const info = {
  commit: process.env.COMMIT_REF ?? 'local',
  context: process.env.CONTEXT ?? 'local',
  builtAt: new Date().toISOString(),
}
writeFileSync(new URL('../dist/version.json', import.meta.url), JSON.stringify(info, null, 2))
console.log('version.json', info)
