import type { Sandbox } from '@qavant-pay/core'
import { error } from './http.ts'
import { isExpired, readSessionId } from './session.ts'
import type { SandboxRepo } from './store.ts'

export type SessionResult = { ok: true; sandbox: Sandbox } | { ok: false; response: Response }

export const unauthenticated = () => error(401, 'UNAUTHENTICATED', 'Start a demo session first')
export const sessionExpired = () => error(401, 'SESSION_EXPIRED', 'Session not found or expired')
export const pinRequired = () => error(401, 'PIN_REQUIRED', 'Enter your PIN first')

/** Resolves the visitor's sandbox from the session cookie, or returns a ready 401 response. */
export async function loadSandbox(req: Request, repo: SandboxRepo, now = new Date()): Promise<SessionResult> {
  const id = readSessionId(req.headers.get('cookie'))
  if (!id) return { ok: false, response: unauthenticated() }

  const sandbox = await repo.get(id)
  if (!sandbox || isExpired(sandbox.createdAt, now)) return { ok: false, response: sessionExpired() }

  return { ok: true, sandbox }
}

/** Same as loadSandbox, but the visitor must also have entered the correct PIN. */
export async function loadAuthenticatedSandbox(
  req: Request,
  repo: SandboxRepo,
  now = new Date(),
): Promise<SessionResult> {
  const session = await loadSandbox(req, repo, now)
  if (session.ok && !session.sandbox.authenticated) return { ok: false, response: pinRequired() }
  return session
}
