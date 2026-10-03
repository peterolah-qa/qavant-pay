// Where sandboxes live: Netlify Blobs in the cloud, an in-memory Map with SANDBOX_STORE=memory.
//
// Writes use OPTIMISTIC LOCKING. Every read returns a version (ETag); a write only succeeds if the
// version is still the same. If another request changed the sandbox in between, we re-read and
// re-apply the change. Without this, two parallel requests could both read balance €100, both
// subtract €80 and both save – a "lost update" that lets you spend money twice.
import { getStore } from '@netlify/blobs'
import type { Sandbox } from '@qavant-pay/core'

export const MAX_WRITE_ATTEMPTS = 5

export class WriteConflictError extends Error {
  constructor() {
    super(`Sandbox changed concurrently ${MAX_WRITE_ATTEMPTS} times in a row`)
  }
}

/** mutate() changes the sandbox in place; `changed: false` skips the write. */
export type Mutation<T> = (sandbox: Sandbox) => { result: T; changed: boolean } | Promise<{ result: T; changed: boolean }>

export interface SandboxRepo {
  get(id: string): Promise<Sandbox | null>
  create(sandbox: Sandbox): Promise<void>
  update<T>(id: string, mutate: Mutation<T>): Promise<{ found: false } | { found: true; result: T }>
}

type Versioned = { sandbox: Sandbox; version: string }

/** Shared retry loop: read → mutate → conditional write → retry on conflict. */
function withOptimisticLocking(
  read: (id: string) => Promise<Versioned | null>,
  writeIfUnchanged: (sandbox: Sandbox, version: string) => Promise<boolean>,
): SandboxRepo['update'] {
  return async (id, mutate) => {
    for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
      const current = await read(id)
      if (!current) return { found: false }

      const { result, changed } = await mutate(current.sandbox)
      if (!changed || (await writeIfUnchanged(current.sandbox, current.version))) {
        return { found: true, result }
      }
    }
    throw new WriteConflictError()
  }
}

// shared via globalThis so separately bundled functions see the same Map in one process
type MemoryEntry = { sandbox: Sandbox; version: number }
const memory: Map<string, MemoryEntry> = ((globalThis as { __qpSandboxes?: Map<string, MemoryEntry> }).__qpSandboxes ??=
  new Map())

function memoryRepo(): SandboxRepo {
  const tick = () => new Promise((resolve) => setImmediate(resolve)) // lets parallel requests interleave like real I/O
  return {
    get: async (id) => structuredClone(memory.get(id)?.sandbox ?? null),
    create: async (sandbox) => void memory.set(sandbox.id, { sandbox: structuredClone(sandbox), version: 1 }),
    update: withOptimisticLocking(
      async (id) => {
        await tick()
        const entry = memory.get(id)
        return entry ? { sandbox: structuredClone(entry.sandbox), version: String(entry.version) } : null
      },
      async (sandbox, version) => {
        await tick()
        const entry = memory.get(sandbox.id)
        if (!entry || String(entry.version) !== version) return false
        memory.set(sandbox.id, { sandbox: structuredClone(sandbox), version: entry.version + 1 })
        return true
      },
    ),
  }
}

function blobsRepo(): SandboxRepo {
  // strong consistency: what one request writes, the very next request reads
  const store = getStore({ name: 'sandboxes', consistency: 'strong' })
  return {
    get: async (id) => ((await store.get(id, { type: 'json' })) as Sandbox | null) ?? null,
    create: async (sandbox) => void (await store.setJSON(sandbox.id, sandbox, { onlyIfNew: true })),
    update: withOptimisticLocking(
      async (id) => {
        const entry = await store.getWithMetadata(id, { type: 'json' })
        return entry ? { sandbox: entry.data as Sandbox, version: entry.etag ?? '' } : null
      },
      // no ETag (should not happen) → plain write instead of failing every request
      async (sandbox, etag) =>
        (await store.setJSON(sandbox.id, sandbox, etag ? { onlyIfMatch: etag } : {})).modified,
    ),
  }
}

export function sandboxRepo(): SandboxRepo {
  return process.env.SANDBOX_STORE === 'memory' ? memoryRepo() : blobsRepo()
}
