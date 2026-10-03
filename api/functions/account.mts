// GET /api/account → balance and masked IBAN of the visitor's sandbox.
import { maskIban } from '@qavant-pay/core'
import { loadAuthenticatedSandbox } from '../lib/auth.ts'
import { json, methodNotAllowed } from '../lib/http.ts'
import { sandboxRepo } from '../lib/store.ts'

export default async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed('GET')

  const session = await loadAuthenticatedSandbox(req, sandboxRepo())
  if (!session.ok) return session.response

  const { holder, iban, balanceCents, currency } = session.sandbox.account
  return json(
    { holder, ibanMasked: maskIban(iban), balanceCents, currency },
    200,
    { 'Cache-Control': 'no-store' },
  )
}
