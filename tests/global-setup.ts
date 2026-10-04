// Runs once before all tests: applies the schema to the test database (if one is configured).
import { readFileSync } from 'node:fs'
import pg from 'pg'

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    console.log('[tests] store: memory (set TEST_DATABASE_URL to run against Postgres)')
    return
  }
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  await client.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'))
  await client.end()
  console.log(`[tests] store: postgres (${new URL(url).host})`)
}
