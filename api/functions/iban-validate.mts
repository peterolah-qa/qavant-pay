// POST /api/iban/validate  { "iban": "SK64 0900 …" }
// The server re-validates with the SAME core function the UI uses – never trust the browser.
import { validateIban } from '@qavant-pay/core'

const MAX_INPUT_LENGTH = 64

const error = (status: number, code: string, message: string, headers: HeadersInit = {}) =>
  Response.json({ code, message }, { status, headers })

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return error(405, 'METHOD_NOT_ALLOWED', 'Use POST', { Allow: 'POST' })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return error(400, 'INVALID_JSON', 'Request body must be valid JSON')
  }

  const iban = (body as { iban?: unknown } | null)?.iban
  if (typeof iban !== 'string' || iban.length > MAX_INPUT_LENGTH) {
    return error(400, 'INVALID_REQUEST', `Body must be {"iban": string} (max ${MAX_INPUT_LENGTH} chars)`)
  }

  return Response.json(validateIban(iban))
}
