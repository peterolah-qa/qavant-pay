// Where sandboxes live.
//   postgres (default) – Neon in the cloud, Docker/CI service locally.
//   memory              – SANDBOX_STORE=memory, for quick experiments without a database.
//
// Every change goes through update(): inside ONE database transaction the sandbox row is locked
// with SELECT … FOR UPDATE. A second request for the same sandbox waits until the first commits,
// so concurrent transfers or PIN guesses are applied one after another – no lost updates.
// (Netlify Blobs could not guarantee this: its conditional writes are not atomic, see PR #13.)
import pg from 'pg'
import type { IdempotencyRecord, Sandbox, Transaction } from '@qavant-pay/core'
import { recordConnect, recordQuery } from './timing.ts'

export class WriteConflictError extends Error {
  constructor(message = 'The sandbox is busy, try again') {
    super(message)
  }
}

/** The store cannot be reached or cannot guarantee a safe write → refuse instead of risking money. */
export class StoreUnavailableError extends Error {}

/** mutate() changes the sandbox in place; `changed: false` skips the write. */
export type Mutation<T> = (sandbox: Sandbox) => { result: T; changed: boolean } | Promise<{ result: T; changed: boolean }>

export interface SandboxRepo {
  get(id: string): Promise<Sandbox | null>
  create(sandbox: Sandbox): Promise<void>
  update<T>(id: string, mutate: Mutation<T>): Promise<{ found: false } | { found: true; result: T }>
}

export const SANDBOX_TTL_HOURS = 24
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const LOCK_TIMEOUT = '5s'

// ───────────────────────────── Postgres ─────────────────────────────

pg.types.setTypeParser(20, (value) => Number(value)) // BIGINT cents → number (always far below 2^53)

let pool: pg.Pool | undefined
function getPool(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new StoreUnavailableError('DATABASE_URL is not configured')
  pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3, // one serverless instance handles one request at a time; tests run several in parallel
    // Keep the connection while the instance stays warm: opening a new one costs TCP + TLS + auth
    // (≈ 70 ms in the same region, ≈ 600 ms across the Atlantic – measured, docs/performance.md).
    idleTimeoutMillis: 240_000, // < 5 min, when Neon suspends an idle compute anyway
    keepAlive: true,
    application_name: process.env.QP_DB_APP_NAME ?? 'qavant-pay-api', // visible in pg_stat_activity
  })
  // a pooled connection that dies while idle must not crash the process – it is dropped and replaced
  pool.on('error', () => {})
  return pool
}

type Queryable = { query(text: string, values?: unknown[]): Promise<pg.QueryResult>; completed: number }

/** Counts every SQL round trip and its duration for the Server-Timing header. */
function timed(db: Pick<pg.PoolClient, 'query'>): Queryable {
  const wrapper: Queryable = {
    completed: 0,
    query: async (text, values) => {
      const start = performance.now()
      try {
        const result = await db.query(text, values)
        wrapper.completed += 1
        return result
      } finally {
        recordQuery(performance.now() - start)
      }
    },
  }
  return wrapper
}

const CONNECTION_LOST = /Connection terminated|Client has encountered a connection error|ECONNRESET|EPIPE/i
const isConnectionLost = (e: unknown) =>
  ['ECONNRESET', 'EPIPE'].includes((e as { code?: string }).code ?? '') || CONNECTION_LOST.test(String((e as Error)?.message))

/**
 * Runs `work` on a pooled connection. A warm instance can be frozen between requests and its idle
 * connection closed meanwhile; the first query then fails with "Connection terminated". If NOTHING
 * reached the database yet, retrying once on a fresh connection is safe – nothing was read or written.
 */
async function withClient<T>(work: (db: Queryable) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const start = performance.now()
    const client = await getPool().connect().catch(translate)
    recordConnect(performance.now() - start)
    const db = timed(client)
    let broken = false
    try {
      return await work(db)
    } catch (e) {
      broken = isConnectionLost(e)
      if (broken && attempt === 1 && db.completed === 0) continue
      throw e
    } finally {
      client.release(broken) // true = destroy the dead connection instead of returning it to the pool
    }
  }
}

// One round trip loads a whole sandbox: the row plus its transactions (and idempotency keys) as JSON.
// Before: 3 queries per read (sandbox, transactions, keys) = 3 round trips.
const TX_JSON = `json_build_object('id', t.id, 'name', t.name, 'type', t.type, 'category', t.category,
  'amount_cents', t.amount_cents, 'booked_at', t.booked_at, 'status', t.status,
  'counterparty_iban', t.counterparty_iban, 'note', t.note)`

async function loadSandbox(db: Queryable, id: string, opts: { keys: boolean }): Promise<Sandbox | null> {
  const { rows } = await db.query(
    `SELECT s.*,
       COALESCE((SELECT json_agg(${TX_JSON} ORDER BY t.booked_at DESC, t.seq DESC)
                   FROM transactions t WHERE t.sandbox_id = s.id), '[]') AS txs,
       ${opts.keys
         ? `COALESCE((SELECT json_agg(json_build_object('key', k.key, 'fingerprint', k.fingerprint, 'status', k.status, 'body', k.body))
                   FROM idempotency_keys k WHERE k.sandbox_id = s.id), '[]')`
         : `'[]'::json`} AS keys
     FROM sandboxes s
     WHERE s.id = $1`,
    [id],
  )
  if (rows.length === 0) return null
  const s = rows[0]

  type TxRow = {
    id: string; name: string; type: Transaction['type']; category: string; amount_cents: number
    booked_at: string; status: Transaction['status']; counterparty_iban: string | null; note: string | null
  }
  type KeyRow = { key: string; fingerprint: string; status: number; body: unknown }

  return {
    id: s.id,
    createdAt: s.created_at.toISOString(),
    account: { holder: s.holder, iban: s.iban, balanceCents: s.balance_cents, currency: 'EUR' },
    transactions: (s.txs as TxRow[]).map(
      (t): Transaction => ({
        id: t.id,
        name: t.name,
        type: t.type,
        category: t.category,
        amountCents: Number(t.amount_cents),
        bookedAt: new Date(t.booked_at).toISOString(),
        status: t.status,
        ...(t.counterparty_iban ? { counterpartyIban: t.counterparty_iban } : {}),
        ...(t.note ? { note: t.note } : {}),
      }),
    ),
    pin: {
      failedAttempts: s.pin_failed_attempts,
      lockedUntil: s.pin_locked_until ? s.pin_locked_until.getTime() : null,
    },
    authenticated: s.authenticated,
    idempotency: Object.fromEntries(
      (s.keys as KeyRow[]).map((k): [string, IdempotencyRecord] => [k.key, { fingerprint: k.fingerprint, status: k.status, body: k.body }]),
    ),
  }
}

/** Transactions as one JSON parameter → json_to_recordset inserts them all in ONE statement. */
const txRecords = (transactions: Transaction[]) =>
  JSON.stringify(
    transactions.map((t) => ({
      id: t.id,
      seq: Number(t.id.split('_')[2]),
      name: t.name,
      type: t.type,
      category: t.category,
      amount_cents: t.amountCents,
      booked_at: t.bookedAt,
      status: t.status,
      counterparty_iban: t.counterpartyIban ?? null,
      note: t.note ?? null,
    })),
  )

const TX_RECORDSET = `json_to_recordset($TX::json) AS t(id text, seq integer, name text, type text, category text,
  amount_cents bigint, booked_at timestamptz, status text, counterparty_iban text, note text)`
const TX_COLUMNS = 'id, sandbox_id, seq, name, type, category, amount_cents, booked_at, status, counterparty_iban, note'
const TX_VALUES = 't.id, $1, t.seq, t.name, t.type, t.category, t.amount_cents, t.booked_at, t.status, t.counterparty_iban, t.note'

/**
 * Writes what mutate() changed – account/PIN row, NEW transactions, NEW idempotency keys – in ONE statement.
 * Before: one UPDATE + one INSERT per new row = several round trips.
 */
async function persistChanges(db: Queryable, before: Sandbox, after: Sandbox) {
  const known = new Set(before.transactions.map((t) => t.id))
  const newKeys = Object.entries(after.idempotency ?? {})
    .filter(([key]) => !before.idempotency?.[key])
    .map(([key, r]) => ({ key, fingerprint: r.fingerprint, status: r.status, body: r.body }))

  await db.query(
    `WITH acc AS (
       UPDATE sandboxes
          SET balance_cents = $2, pin_failed_attempts = $3, pin_locked_until = $4, authenticated = $5
        WHERE id = $1
     ),
     txs AS (
       INSERT INTO transactions (${TX_COLUMNS})
       SELECT ${TX_VALUES} FROM ${TX_RECORDSET.replace('$TX', '$6')}
     ),
     keys AS (
       INSERT INTO idempotency_keys (sandbox_id, key, fingerprint, status, body)
       SELECT $1, k.key, k.fingerprint, k.status, k.body
         FROM json_to_recordset($7::json) AS k(key text, fingerprint text, status integer, body jsonb)
     )
     SELECT 1`,
    [
      after.id,
      after.account.balanceCents,
      after.pin.failedAttempts,
      after.pin.lockedUntil === null ? null : new Date(after.pin.lockedUntil),
      after.authenticated,
      txRecords(after.transactions.filter((t) => !known.has(t.id))),
      JSON.stringify(newKeys),
    ],
  )
}

/** Maps low-level failures to errors the API turns into 409 / 503 instead of a bare 500. */
function translate(error: unknown): never {
  const code = (error as { code?: string }).code
  if (code === '55P03' || code === '40P01') throw new WriteConflictError() // lock timeout / deadlock
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === '57P01' || isConnectionLost(error)) {
    throw new StoreUnavailableError(`Database unavailable (${code ?? 'connection lost'})`)
  }
  throw error
}

function postgresRepo(): SandboxRepo {
  return {
    // 1 round trip
    get: (id) => withClient((db) => loadSandbox(db, id, { keys: false })).catch(translate),

    // 1 round trip, atomic without BEGIN/COMMIT: a single statement either fully succeeds or not at all.
    // Before: BEGIN, DELETE, INSERT sandbox, 12 × INSERT transaction, COMMIT = 16 round trips.
    create: (sandbox) =>
      withClient(async (db) => {
        await db.query(
          `WITH cleanup AS ( -- housekeeping: demo sandboxes live 24 h (keeps the free-tier database small)
             DELETE FROM sandboxes WHERE created_at < now() - interval '${SANDBOX_TTL_HOURS} hours'
           ),
           s AS (
             INSERT INTO sandboxes (id, created_at, holder, iban, balance_cents, pin_failed_attempts, pin_locked_until, authenticated)
             VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)
             RETURNING id
           )
           INSERT INTO transactions (${TX_COLUMNS})
           SELECT ${TX_VALUES} FROM s, ${TX_RECORDSET.replace('$TX', '$8')}`,
          [
            sandbox.id,
            sandbox.createdAt,
            sandbox.account.holder,
            sandbox.account.iban,
            sandbox.account.balanceCents,
            sandbox.pin.failedAttempts,
            sandbox.authenticated,
            txRecords(sandbox.transactions),
          ],
        )
      }).catch(translate),

    // 4 round trips when something changes (3 when not): BEGIN+SET+lock, load, write, COMMIT.
    // Before: 7 (PIN) or 9 (transfer).
    //
    // The lock is taken by its OWN statement, before the load. Folding "FOR UPDATE" into the load query
    // looked like a free saving, but under READ COMMITTED a statement keeps the snapshot it started with:
    // after waiting for the lock it re-reads the locked sandbox ROW, yet its sub-selects still see the old
    // snapshot – without the transaction a parallel request has just committed. Two parallel transfers then
    // computed the same next transaction id. Caught by "5 PARALLEL transfers" (docs/journal.md P.3).
    update: (id, mutate) =>
      withClient(async (db) => {
        if (!UUID.test(id)) return { found: false as const } // id goes into a simple-protocol query below
        // three statements, ONE round trip (simple query protocol, no parameters → escaped literal)
        await db.query(
          `BEGIN; SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'; SELECT 1 FROM sandboxes WHERE id = ${pg.escapeLiteral(id)} FOR UPDATE`,
        )
        try {
          // a NEW statement → a new snapshot taken after the lock: sees everything committed before us
          const sandbox = await loadSandbox(db, id, { keys: true })
          if (!sandbox) {
            await db.query('ROLLBACK')
            return { found: false as const }
          }
          const before = structuredClone(sandbox)
          const { result, changed } = await mutate(sandbox)
          if (changed) await persistChanges(db, before, sandbox)
          await db.query('COMMIT')
          return { found: true as const, result }
        } catch (e) {
          await db.query('ROLLBACK').catch(() => {})
          throw e
        }
      }).catch(translate),
  }
}

// ───────────────────────────── Memory ─────────────────────────────
// Same contract, one global lock queue per sandbox (serialises updates like FOR UPDATE does).

const memory: Map<string, Sandbox> = ((globalThis as { __qpSandboxes?: Map<string, Sandbox> }).__qpSandboxes ??= new Map())
const locks = new Map<string, Promise<unknown>>()

function memoryRepo(): SandboxRepo {
  return {
    get: async (id) => structuredClone(memory.get(id) ?? null),
    create: async (sandbox) => void memory.set(sandbox.id, structuredClone(sandbox)),
    update: (id, mutate) => {
      const previous = locks.get(id) ?? Promise.resolve()
      const run = previous.then(async () => {
        const current = memory.get(id)
        if (!current) return { found: false as const }
        const sandbox = structuredClone(current)
        const { result, changed } = await mutate(sandbox)
        if (changed) memory.set(id, sandbox)
        return { found: true as const, result }
      })
      locks.set(id, run.catch(() => {}))
      return run
    },
  }
}

export function sandboxRepo(): SandboxRepo {
  return process.env.SANDBOX_STORE === 'memory' ? memoryRepo() : postgresRepo()
}
