// Where sandboxes live. Netlify Blobs in the cloud; an in-memory Map when SANDBOX_STORE=memory
// (local experiments). The rest of the code only knows the SandboxRepo interface.
import { getStore } from '@netlify/blobs'
import type { Sandbox } from '@qavant-pay/core'

export interface SandboxRepo {
  get(id: string): Promise<Sandbox | null>
  save(sandbox: Sandbox): Promise<void>
}

// shared via globalThis so separately bundled functions see the same Map in one process
const memory: Map<string, Sandbox> = ((globalThis as { __qpSandboxes?: Map<string, Sandbox> }).__qpSandboxes ??=
  new Map())

export function sandboxRepo(): SandboxRepo {
  if (process.env.SANDBOX_STORE === 'memory') {
    return {
      get: async (id) => structuredClone(memory.get(id) ?? null),
      save: async (sandbox) => void memory.set(sandbox.id, structuredClone(sandbox)),
    }
  }

  // strong consistency: a sandbox written by /demo/session is readable by the very next request
  const store = getStore({ name: 'sandboxes', consistency: 'strong' })
  return {
    get: async (id) => ((await store.get(id, { type: 'json' })) as Sandbox | null) ?? null,
    save: async (sandbox) => void (await store.setJSON(sandbox.id, sandbox)),
  }
}
