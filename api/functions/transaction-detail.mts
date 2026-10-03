// GET /api/transactions/:id
// Looks the id up ONLY inside the caller's own sandbox. Someone else's id → 404, not 403:
// the API must not even reveal that the transaction exists (protection against IDOR).
import { loadAuthenticatedSandbox } from '../lib/auth.ts'
import { error, json, methodNotAllowed } from '../lib/http.ts'
import { sandboxRepo } from '../lib/store.ts'

const TX_ID = /^tx_[0-9a-f]{8}_\d{2,}$/

/** The id arrives as ?id= (Netlify rewrite) or as the last path segment – accept both. */
function readId(req: Request): string {
  const url = new URL(req.url)
  return url.searchParams.get('id') ?? decodeURIComponent(url.pathname.split('/').pop() ?? '')
}

export default async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET')

  const session = await loadAuthenticatedSandbox(req, sandboxRepo())
  if (!session.ok) return session.response

  const id = readId(req)
  const transaction = TX_ID.test(id) ? session.sandbox.transactions.find((t) => t.id === id) : undefined
  if (!transaction) return error(404, 'NOT_FOUND', 'Transaction not found')

  return json(transaction, 200, { 'Cache-Control': 'no-store' })
}
