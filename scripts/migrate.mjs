// Applies db/schema.sql to DATABASE_URL. Runs at the end of every Netlify build (schema is idempotent).
// Without DATABASE_URL (e.g. the CI lint/build job) it does nothing.
import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.log('migrate: DATABASE_URL not set – skipping')
  process.exit(0)
}

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'))
  const { rows } = await client.query(
    "SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_name IN ('sandboxes','transactions','idempotency_keys')",
  )
  console.log(`migrate: schema applied (${rows[0].tables}/3 tables present on ${new URL(url).hostname})`)
} finally {
  await client.end()
}
