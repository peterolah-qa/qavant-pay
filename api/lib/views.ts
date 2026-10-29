// Response shapes shared by several routes – one definition, so /api/account, /api/dashboard,
// /api/session and the PIN response can never drift apart.
import { maskIban, type Sandbox, type Transaction } from '@qavant-pay/core'

export const RECENT_COUNT = 4

export type AccountView = { holder: string; ibanMasked: string; balanceCents: number; currency: 'EUR' }
export type DashboardView = { account: AccountView; recent: Transaction[] }

export function accountView(sandbox: Sandbox): AccountView {
  const { holder, iban, balanceCents, currency } = sandbox.account
  return { holder, ibanMasked: maskIban(iban), balanceCents, currency }
}

/** Everything the dashboard shows – sent with the PIN answer, so the dashboard needs no extra request. */
export function dashboardView(sandbox: Sandbox): DashboardView {
  return { account: accountView(sandbox), recent: sandbox.transactions.slice(0, RECENT_COUNT) }
}
