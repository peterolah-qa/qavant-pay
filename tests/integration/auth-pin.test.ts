// Integration tests: real API handlers + real core logic, in-memory store instead of Netlify Blobs.
// Fake timers let us jump past the 30 s lockout instantly – impossible against the deployed API.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SANDBOX_STORE = 'memory'

let createSession: (req: Request) => Promise<Response>
let authPin: (req: Request) => Promise<Response>
let account: (req: Request) => Promise<Response>

beforeAll(async () => {
  createSession = (await import('../../api/functions/demo-session.mts')).default
  authPin = (await import('../../api/functions/auth-pin.mts')).default
  account = (await import('../../api/functions/account.mts')).default
})

const URL = 'https://pay.qavant.dev'
let cookie: string

const enterPin = (pin: string) =>
  authPin(new Request(`${URL}/api/auth/pin`, { method: 'POST', headers: { cookie }, body: JSON.stringify({ pin }) }))

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-03T12:00:00Z'))
  const res = await createSession(new Request(`${URL}/api/demo/session`, { method: 'POST' }))
  cookie = res.headers.get('set-cookie')!.split(';')[0]
})

afterEach(() => vi.useRealTimers())

describe('POST /api/auth/pin', () => {
  it('account is closed until the PIN is entered, open after', async () => {
    const before = await account(new Request(`${URL}/api/account`, { headers: { cookie } }))
    expect(before.status).toBe(401)
    expect(await before.json()).toMatchObject({ code: 'PIN_REQUIRED' })

    expect((await enterPin('1234')).status).toBe(200)

    const after = await account(new Request(`${URL}/api/account`, { headers: { cookie } }))
    expect(after.status).toBe(200)
  })

  it('wrong PIN → 401 WRONG_PIN with attempts left', async () => {
    const res = await enterPin('0000')
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'WRONG_PIN', attemptsLeft: 2 })
  })

  it('3rd wrong PIN → 423 PIN_LOCKED with Retry-After: 30', async () => {
    await enterPin('0000')
    await enterPin('0000')
    const res = await enterPin('0000')
    expect(res.status).toBe(423)
    expect(res.headers.get('retry-after')).toBe('30')
    expect(await res.json()).toMatchObject({ code: 'PIN_LOCKED', retryInMs: 30_000 })
  })

  it('lockout is enforced on the server and lifts after exactly 30 s', async () => {
    for (let i = 0; i < 3; i++) await enterPin('0000')

    vi.advanceTimersByTime(29_999)
    expect((await enterPin('1234')).status).toBe(423) // even the correct PIN

    vi.advanceTimersByTime(1)
    expect((await enterPin('1234')).status).toBe(200)
  })

  it.each([
    ['abcd'],
    ['123'],
    ['12345'],
    [''],
  ])('invalid PIN format %j → 400 and does NOT count as an attempt', async (pin) => {
    expect((await enterPin(pin)).status).toBe(400)
    expect(await (await enterPin('0000')).json()).toMatchObject({ attemptsLeft: 2 })
  })

  it('no session → 401 UNAUTHENTICATED', async () => {
    cookie = ''
    const res = await enterPin('1234')
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})
