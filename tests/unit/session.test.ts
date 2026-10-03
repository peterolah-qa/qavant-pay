import { describe, expect, it } from 'vitest'
import { SESSION_TTL_MS, isExpired, readSessionId, sessionCookie } from '../../api/lib/session.ts'

const ID = '6282f31c-0c2a-470c-b488-b42e84ba2d7b'

describe('readSessionId', () => {
  it.each([
    [`qp_session=${ID}`, ID],
    [`theme=dark; qp_session=${ID}; lang=sk`, ID],
    [null, null],
    ['', null],
    ['theme=dark', null],
    ['qp_session=../../etc/passwd', null], // never reaches the store
    ['qp_session=not-a-uuid', null],
    [`qp_session=${ID.toUpperCase()}`, null],
  ])('%j → %j', (header, expected) => {
    expect(readSessionId(header)).toBe(expected)
  })
})

describe('sessionCookie', () => {
  const cookie = sessionCookie(ID)

  it.each(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api', 'Max-Age=86400'])('contains %s', (flag) => {
    expect(cookie).toContain(flag)
  })
})

describe('isExpired – 24 h TTL boundary', () => {
  const created = '2026-10-03T12:00:00.000Z'
  const at = (ms: number) => new Date(Date.parse(created) + ms)

  it.each([
    [SESSION_TTL_MS - 1, false],
    [SESSION_TTL_MS, true],
  ])('%i ms after creation → expired=%s', (ms, expired) => {
    expect(isExpired(created, at(ms))).toBe(expired)
  })
})
