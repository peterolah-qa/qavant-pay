import type { Sandbox } from '@qavant-pay/core'
import { error } from './http.ts'
import { isExpired, readSessionId } from './session.ts'
import type { SandboxRepo } from './store.ts'

export type SessionResult = { ok: true; sandbox: Sandbox } | { ok: false; response: Response }

/** Resolves the visitor's sandbox from the session cookie, or returns a ready 401 response. */
export async function loadSandbox(req: Request, repo: SandboxRepo, now = new Date()): Promise<SessionResult> {
  const id = readSessionId(req.headers.get('cookie'))
  if (!id) {
    return { ok: false, response: error(401, 'UNAUTHENTICATED', 'Start a demo session first') }
  }

  const sandbox = await repo.get(id)
  if (!sandbox || isExpired(sandbox.createdAt, now)) {
    return { ok: false, response: error(401, 'SESSION_EXPIRED', 'Session not found or expired') }
  }

  return { ok: true, sandbox }
}
