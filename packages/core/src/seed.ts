// Deterministic demo data for a fresh sandbox. Pure: same (id, now) → same sandbox.
import type { Cents } from './money.ts'
import { initialPinState, type PinState } from './pin.ts'

export const DEMO_PIN = '1234'

export type TxType = 'income' | 'spending' | 'bills'

export type Transaction = {
  id: string
  name: string
  type: TxType
  category: string
  amountCents: Cents // negative = money out
  bookedAt: string // ISO 8601
  status: 'COMPLETED'
}

export type Account = {
  holder: string
  iban: string
  balanceCents: Cents
  currency: 'EUR'
}

export type Sandbox = {
  id: string
  createdAt: string
  account: Account
  transactions: Transaction[] // newest first
  pin: PinState
  authenticated: boolean
}

const SEED: Array<[minutesAgo: number, name: string, type: TxType, category: string, amountCents: Cents]> = [
  [25, 'Lidl', 'spending', 'Groceries', -3890],
  [190, 'Martin K.', 'income', 'Transfer in', 12000],
  [600, 'Bistro Kaviareň', 'spending', 'Food', -460],
  [1500, 'Spotify', 'bills', 'Subscription', -1099],
  [1620, 'Qavant s.r.o.', 'income', 'Invoice payment', 20240],
  [2900, 'Orange SK', 'bills', 'Mobile', -1900],
  [4400, 'Tesco', 'spending', 'Groceries', -5214],
  [7300, 'Demo Corp', 'income', 'Salary', 185000],
  [10100, 'ZSE Energia', 'bills', 'Electricity', -6400],
  [14500, 'Bolt', 'spending', 'Transport', -890],
  [20200, 'Jana N.', 'income', 'Transfer in', 2500],
  [28900, 'Netflix', 'bills', 'Subscription', -1199],
]

export const SEED_BALANCE_CENTS: Cents = 428_052

export function seedSandbox(id: string, now: Date): Sandbox {
  const prefix = id.replace(/-/g, '').slice(0, 8)
  return {
    id,
    createdAt: now.toISOString(),
    account: {
      holder: 'Peter',
      iban: 'SK2575000000004017757541',
      balanceCents: SEED_BALANCE_CENTS,
      currency: 'EUR',
    },
    transactions: SEED.map(([minutesAgo, name, type, category, amountCents], i) => ({
      id: `tx_${prefix}_${String(i + 1).padStart(2, '0')}`,
      name,
      type,
      category,
      amountCents,
      bookedAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
      status: 'COMPLETED' as const,
    })),
    pin: initialPinState,
    authenticated: false,
  }
}

/** "SK2575000000004017757541" → "•••• 7541" */
export function maskIban(iban: string): string {
  return `•••• ${iban.slice(-4)}`
}
