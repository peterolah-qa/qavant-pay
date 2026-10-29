// GET /api/account → balance and masked IBAN of the visitor's sandbox.
import { loadAuthenticatedSandbox } from '../lib/auth.ts'
import { json, methodNotAllowed } from '../lib/http.ts'
import { sandboxRepo } from '../lib/store.ts'
import { accountView } from '../lib/views.ts'

const handler = async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET')

  const session = await loadAuthenticatedSandbox(req, sandboxRepo())
  if (!session.ok) return session.response

  return json(accountView(session.sandbox), 200, { 'Cache-Control': 'no-store' })
}

export default handler
