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
const LOCK_TIMEOUT = '5s'

// ───────────────────────────── Postgres ─────────────────────────────

pg.types.setTypeParser(20, (value) => Number(value)) // BIGINT cents → number (always far below 2^53)

let pool: pg.Pool | undefined
function getPool(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new StoreUnavailableError('DATABASE_URL is not configured')
  // one serverless instance handles one request at a time – a small pool is enough
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10_000 })
  return pool
}

type Queryable = Pick<pg.PoolClient, 'query'>

async function loadSandbox(db: Queryable, id: string, lock: boolean): Promise<Sandbox | null> {
  const { rows } = await db.query(`SELECT * FROM sandboxes WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id])
  if (rows.length === 0) return null
  const s = rows[0]

  const txs = await db.query(
    'SELECT * FROM transactions WHERE sandbox_id = $1 ORDER BY booked_at DESC, seq DESC',
    [id],
  )
  const keys = await db.query('SELECT key, fingerprint, status, body FROM idempotency_keys WHERE sandbox_id = $1', [id])

  return {
    id: s.id,
    createdAt: s.created_at.toISOString(),
    account: { holder: s.holder, iban: s.iban, balanceCents: s.balance_cents, currency: 'EUR' },
    transactions: txs.rows.map(
      (t): Transaction => ({
        id: t.id,
        name: t.name,
        type: t.type,
        category: t.category,
        amountCents: t.amount_cents,
        bookedAt: t.booked_at.toISOString(),
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
      keys.rows.map((k): [string, IdempotencyRecord] => [k.key, { fingerprint: k.fingerprint, status: k.status, body: k.body }]),
    ),
  }
}

async function insertTransactions(db: Queryable, sandboxId: string, transactions: Transaction[]) {
  for (const t of transactions) {
    await db.query(
      `INSERT INTO transactions
         (id, sandbox_id, seq, name, type, category, amount_cents, booked_at, status, counterparty_iban, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        t.id,
        sandboxId,
        Number(t.id.split('_')[2]),
        t.name,
        t.type,
        t.category,
        t.amountCents,
        t.bookedAt,
        t.status,
        t.counterpartyIban ?? null,
        t.note ?? null,
      ],
    )
  }
}

/** Writes what mutate() changed: the account/PIN row, NEW transactions and NEW idempotency keys. */
async function persistChanges(db: Queryable, before: Sandbox, after: Sandbox) {
  await db.query(
    `UPDATE sandboxes
        SET balance_cents = $2, pin_failed_attempts = $3, pin_locked_until = $4, authenticated = $5
      WHERE id = $1`,
    [
      after.id,
      after.account.balanceCents,
      after.pin.failedAttempts,
      after.pin.lockedUntil === null ? null : new Date(after.pin.lockedUntil),
      after.authenticated,
    ],
  )

  const known = new Set(before.transactions.map((t) => t.id))
  await insertTransactions(db, after.id, after.transactions.filter((t) => !known.has(t.id)))

  for (const [key, record] of Object.entries(after.idempotency ?? {})) {
    if (before.idempotency?.[key]) continue
    await db.query(
      'INSERT INTO idempotency_keys (sandbox_id, key, fingerprint, status, body) VALUES ($1, $2, $3, $4, $5)',
      [after.id, key, record.fingerprint, record.status, JSON.stringify(record.body)],
    )
  }
}

/** Maps low-level failures to errors the API turns into 409 / 503 instead of a bare 500. */
function translate(error: unknown): never {
  const code = (error as { code?: string }).code
  if (code === '55P03' || code === '40P01') throw new WriteConflictError() // lock timeout / deadlock
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === '57P01') {
    throw new StoreUnavailableError(`Database unavailable (${code})`)
  }
  throw error
}

function postgresRepo(): SandboxRepo {
  return {
    async get(id) {
      try {
        return await loadSandbox(getPool(), id, false)
      } catch (e) {
        return translate(e)
      }
    },

    async create(sandbox) {
      const client = await getPool().connect().catch(translate)
      try {
        await client.query('BEGIN')
        // housekeeping: demo sandboxes live 24 h (keeps the free-tier database small)
        await client.query(`DELETE FROM sandboxes WHERE created_at < now() - interval '${SANDBOX_TTL_HOURS} hours'`)
        await client.query(
          `INSERT INTO sandboxes (id, created_at, holder, iban, balance_cents, pin_failed_attempts, pin_locked_until, authenticated)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            sandbox.id,
            sandbox.createdAt,
            sandbox.account.holder,
            sandbox.account.iban,
            sandbox.account.balanceCents,
            sandbox.pin.failedAttempts,
            null,
            sandbox.authenticated,
          ],
        )
        await insertTransactions(client, sandbox.id, sandbox.transactions)
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        translate(e)
      } finally {
        client.release()
      }
    },

    async update(id, mutate) {
      const client = await getPool().connect().catch(translate)
      try {
        await client.query('BEGIN')
        await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`)

        const sandbox = await loadSandbox(client, id, true) // ← row lock held until COMMIT
        if (!sandbox) {
          await client.query('ROLLBACK')
          return { found: false }
        }

        const before = structuredClone(sandbox)
        const { result, changed } = await mutate(sandbox)
        if (changed) await persistChanges(client, before, sandbox)

        await client.query('COMMIT')
        return { found: true, result }
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        return translate(e)
      } finally {
        client.release()
      }
    },
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
