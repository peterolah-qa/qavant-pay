// POST /api/session → "make sure I have a session" – the ONE request the app sends on start.
//   valid session, PIN entered → 200 { stage: 'app', dashboard }   (straight to the dashboard)
//   valid session, no PIN yet  → 200 { stage: 'pin' }
//   no / unknown / old session → 201 { stage: 'pin', expiresAt } + new sandbox + Set-Cookie
// Before: GET /api/account (401) → POST /api/demo/session → … = two round trips before the PIN screen.
import { seedSandbox } from '@qavant-pay/core'
import { json, methodNotAllowed } from '../lib/http.ts'
import { SESSION_TTL_MS, isExpired, readSessionId, sessionCookie } from '../lib/session.ts'
import { sandboxRepo } from '../lib/store.ts'
import { dashboardView } from '../lib/views.ts'

const handler = async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST')

  const repo = sandboxRepo()
  const now = new Date()
  const id = readSessionId(req.headers.get('cookie'))
  const existing = id ? await repo.get(id) : null

  if (existing && !isExpired(existing.createdAt, now)) {
    return json(
      existing.authenticated ? { stage: 'app', dashboard: dashboardView(existing) } : { stage: 'pin' },
      200,
      { 'Cache-Control': 'no-store' },
    )
  }

  const sandbox = seedSandbox(crypto.randomUUID(), now)
  await repo.create(sandbox)
  return json(
    { stage: 'pin', expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString() },
    201,
    { 'Set-Cookie': sessionCookie(sandbox.id), 'Cache-Control': 'no-store' },
  )
}

export default handler
