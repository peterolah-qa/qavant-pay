// Runs in every test worker before the tests.
// TEST_DATABASE_URL set (CI service / local Docker) → integration tests hit a REAL Postgres,
// so the parallel tests prove real row locking. Not set → fast in-memory store.
// Never uses DATABASE_URL directly, so a production connection string can't be hit by accident.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.SANDBOX_STORE = 'postgres'
} else {
  delete process.env.DATABASE_URL
  process.env.SANDBOX_STORE = 'memory'
}
