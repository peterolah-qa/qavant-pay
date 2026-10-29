// GET /api/dashboard → account + the 4 most recent transactions in ONE request
// (the dashboard used to make two: /api/account and /api/transactions?limit=4).
import { loadAuthenticatedSandbox } from '../lib/auth.ts'
import { json, methodNotAllowed } from '../lib/http.ts'
import { sandboxRepo } from '../lib/store.ts'
import { dashboardView } from '../lib/views.ts'

const handler = async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET')

  const session = await loadAuthenticatedSandbox(req, sandboxRepo())
  if (!session.ok) return session.response

  return json(dashboardView(session.sandbox), 200, { 'Cache-Control': 'no-store' })
}

export default handler
