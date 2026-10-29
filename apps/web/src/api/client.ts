// Typed client for the Qavant Pay API. Never throws: every call returns { ok, data } or { ok, error },
// so screens handle failures explicitly (wrong PIN, lockout, expired session, offline …).
import type { Transaction, TransferInput, TxFilter } from '@qavant-pay/core'

export type ApiError = {
  status: number // 0 = network error
  code: string
  message?: string
  attemptsLeft?: number
  retryInMs?: number
  maxAllowedCents?: number
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export type Account = { holder: string; ibanMasked: string; balanceCents: number; currency: 'EUR' }
export type TransactionPage = { items: Transaction[]; nextCursor: string | null }
export type TransferReceipt = { transaction: Transaction; balanceCents: number }
export type Dashboard = { account: Account; recent: Transaction[] }
export type SessionStart = { stage: 'pin' } | { stage: 'app'; dashboard: Dashboard }
export type HistoryParams = { type?: TxFilter; q?: string; limit?: number; cursor?: string | null }

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

// Dashboard data that arrived WITH another answer (app start, PIN) – the dashboard takes it once
// instead of asking the server again. One request less on every login.
// Only for a few seconds: after a deep link (/transfer) the dashboard may open much later, after a
// transfer – then an old copy would show a wrong balance.
const PREFETCH_TTL_MS = 5_000
let prefetched: { dashboard: Dashboard; at: number } | null = null
const remember = <T extends { dashboard?: Dashboard }>(result: ApiResult<T>): ApiResult<T> => {
  if (result.ok && result.data.dashboard) prefetched = { dashboard: result.data.dashboard, at: Date.now() }
  return result
}

export const api = {
  /** App start: ONE request answers "do I have a session, is the PIN entered" (and creates one if not). */
  session: async () => remember(await request<SessionStart & { dashboard?: Dashboard }>('/api/session', { method: 'POST' })),
  enterPin: async (pin: string) =>
    remember(await request<{ authenticated: true; dashboard?: Dashboard }>('/api/auth/pin', { method: 'POST', body: JSON.stringify({ pin }) })),
  /** Account + recent transactions in one request – or the copy that just came with the PIN answer. */
  dashboard: async (): Promise<ApiResult<Dashboard>> => {
    const ready = prefetched && Date.now() - prefetched.at < PREFETCH_TTL_MS ? prefetched.dashboard : null
    prefetched = null // use once: coming back to the dashboard later shows fresh data
    return ready ? { ok: true, data: ready } : request<Dashboard>('/api/dashboard')
  },
  account: () => request<Account>('/api/account'),
  transactions: (limit = 20) => request<TransactionPage>(`/api/transactions?limit=${limit}`),
  history: ({ type = 'all', q = '', limit = 20, cursor = null }: HistoryParams, signal?: AbortSignal) => {
    const params = new URLSearchParams({ type, limit: String(limit) })
    if (q) params.set('q', q)
    if (cursor) params.set('cursor', cursor)
    return request<TransactionPage>(`/api/transactions?${params}`, { signal })
  },
  transaction: (id: string) => request<Transaction>(`/api/transactions/${encodeURIComponent(id)}`),
  /** The same idempotencyKey for every retry of ONE transfer → the server books it at most once. */
  transfer: (input: TransferInput, idempotencyKey: string) =>
    request<TransferReceipt>('/api/transfers', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    }),
}
