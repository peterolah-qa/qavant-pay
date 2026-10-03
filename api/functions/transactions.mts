// GET /api/transactions?type=income&q=lidl&limit=20&cursor=<id>
import { queryTransactions, type TxFilter } from '@qavant-pay/core'
import { loadAuthenticatedSandbox } from '../lib/auth.ts'
import { error, json, methodNotAllowed } from '../lib/http.ts'
import { sandboxRepo } from '../lib/store.ts'

const MESSAGES = {
  INVALID_TYPE: 'type must be one of: all, income, spending, bills',
  INVALID_LIMIT: 'limit must be an integer between 1 and 50',
  INVALID_QUERY: 'q must be at most 50 characters',
  INVALID_CURSOR: 'cursor does not match any transaction in this result set',
} as const

export default async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET')

  const session = await loadAuthenticatedSandbox(req, sandboxRepo())
  if (!session.ok) return session.response

  const params = new URL(req.url).searchParams
  const limitParam = params.get('limit')
  const result = queryTransactions(session.sandbox.transactions, {
    type: (params.get('type') ?? 'all') as TxFilter,
    q: params.get('q') ?? '',
    limit: limitParam === null ? undefined : Number(limitParam),
    cursor: params.get('cursor'),
  })

  if (!result.ok) return error(400, result.code, MESSAGES[result.code])
  return json(result.page, 200, { 'Cache-Control': 'no-store' })
}
