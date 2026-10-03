// Small helpers shared by all API functions.

export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers })

/** Every error has the same shape: { code, message } – tests assert on `code`. */
export const error = (status: number, code: string, message: string, headers: HeadersInit = {}) =>
  Response.json({ code, message }, { status, headers })

export const methodNotAllowed = (allowed: string) =>
  error(405, 'METHOD_NOT_ALLOWED', `Use ${allowed}`, { Allow: allowed })
