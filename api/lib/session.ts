// Session = random UUID in an HttpOnly cookie, pointing to the visitor's sandbox.

export const SESSION_COOKIE = 'qp_session'
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Reads our session id from the Cookie header; anything that is not a v4 UUID is ignored. */
export function readSessionId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) {
      const value = rest.join('=')
      return UUID.test(value) ? value : null
    }
  }
  return null
}

/**
 * HttpOnly  → JavaScript in the page cannot read it (XSS cannot steal the session)
 * Secure    → sent over HTTPS only
 * SameSite  → not sent with requests from other sites (CSRF)
 * Path=/api → only the API ever receives it
 */
export function sessionCookie(id: string): string {
  return `${SESSION_COOKIE}=${id}; Max-Age=${SESSION_TTL_MS / 1000}; Path=/api; HttpOnly; Secure; SameSite=Strict`
}

export function isExpired(createdAt: string, now: Date): boolean {
  return now.getTime() - Date.parse(createdAt) >= SESSION_TTL_MS
}
