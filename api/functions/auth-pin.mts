// POST /api/auth/pin  { "pin": "1234" }
// The lockout state lives on the SERVER (in the sandbox), so it cannot be bypassed
// by reloading the page or editing JavaScript in the browser.
import { DEMO_PIN, attemptPin } from '@qavant-pay/core'
import { loadSandbox } from '../lib/auth.ts'
import { error, json, methodNotAllowed } from '../lib/http.ts'
import { sandboxRepo } from '../lib/store.ts'

export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed('POST')

  const repo = sandboxRepo()
  const now = new Date()
  const session = await loadSandbox(req, repo, now)
  if (!session.ok) return session.response

  let pin: unknown
  try {
    pin = ((await req.json()) as { pin?: unknown } | null)?.pin
  } catch {
    return error(400, 'INVALID_JSON', 'Request body must be valid JSON')
  }
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return error(400, 'INVALID_REQUEST', 'Body must be {"pin": "<4 digits>"}')
  }

  const { sandbox } = session
  const attempt = attemptPin(sandbox.pin, pin, DEMO_PIN, now.getTime())
  sandbox.pin = attempt.state
  if (attempt.result === 'OK') sandbox.authenticated = true
  await repo.save(sandbox)

  switch (attempt.result) {
    case 'OK':
      return json({ authenticated: true })
    case 'WRONG':
      return Response.json(
        { code: 'WRONG_PIN', message: 'Wrong PIN', attemptsLeft: attempt.attemptsLeft },
        { status: 401 },
      )
    case 'LOCKED':
      return Response.json(
        { code: 'PIN_LOCKED', message: 'Too many attempts', retryInMs: attempt.retryInMs },
        { status: 423, headers: { 'Retry-After': String(Math.ceil(attempt.retryInMs / 1000)) } },
      )
  }
}
