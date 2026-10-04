// Typed client for the Qavant Pay API. Never throws: every call returns { ok, data } or { ok, error },
// so screens handle failures explicitly (wrong PIN, lockout, expired session, offline …).
import type { Transaction } from '@qavant-pay/core'

export type ApiError = {
  status: number // 0 = network error
  code: string
  message?: string
  attemptsLeft?: number
  retryInMs?: number
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export type Account = { holder: string; ibanMasked: string; balanceCents: number; currency: 'EUR' }
export type TransactionPage = { items: Transaction[]; nextCursor: string | null }

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin', // send the HttpOnly session cookie
      headers: { 'content-type': 'application/json', ...init.headers },
    })
  } catch {
    return { ok: false, error: { status: 0, code: 'NETWORK_ERROR' } }
  }

  // Anything that is not our JSON (e.g. an HTML error page from a proxy) is an error, never a success.
  if (!res.headers.get('content-type')?.includes('application/json')) {
    return { ok: false, error: { status: res.status, code: 'BAD_RESPONSE' } }
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (res.ok) return { ok: true, data: body as T }
  return { ok: false, error: { ...body, status: res.status, code: String(body.code ?? 'UNKNOWN') } }
}

export const api = {
  account: () => request<Account>('/api/account'),
  startSession: () => request<{ expiresAt: string }>('/api/demo/session', { method: 'POST' }),
  enterPin: (pin: string) =>
    request<{ authenticated: true }>('/api/auth/pin', { method: 'POST', body: JSON.stringify({ pin }) }),
  transactions: (limit = 20) => request<TransactionPage>(`/api/transactions?limit=${limit}`),
}
