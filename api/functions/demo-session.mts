// POST /api/demo/session → creates a fresh sandbox (seeded account + 12 transactions)
// and returns it via an HttpOnly session cookie. Every visitor gets their own data.
import { seedSandbox } from '@qavant-pay/core'
import { json, methodNotAllowed } from '../lib/http.ts'
import { SESSION_TTL_MS, sessionCookie } from '../lib/session.ts'
import { sandboxRepo } from '../lib/store.ts'

export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST')

  const now = new Date()
  const sandbox = seedSandbox(crypto.randomUUID(), now)
  await sandboxRepo().create(sandbox)

  return json(
    { expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString() },
    201,
    { 'Set-Cookie': sessionCookie(sandbox.id), 'Cache-Control': 'no-store' },
  )
}
