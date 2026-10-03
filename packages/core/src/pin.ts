// PIN lockout as a pure state machine (BR-01).
// Time is passed in as `now` instead of calling Date.now() inside,
// so tests can jump 30 seconds forward instantly – an injected clock.

export const MAX_ATTEMPTS = 3
export const LOCK_MS = 30_000

export type PinState = {
  failedAttempts: number
  lockedUntil: number | null // epoch ms
}

export const initialPinState: PinState = { failedAttempts: 0, lockedUntil: null }

export type PinAttempt =
  | { result: 'OK'; state: PinState }
  | { result: 'WRONG'; attemptsLeft: number; state: PinState }
  | { result: 'LOCKED'; retryInMs: number; state: PinState }

export function isLocked(state: PinState, now: number): boolean {
  return state.lockedUntil !== null && now < state.lockedUntil
}

export function attemptPin(state: PinState, entered: string, expected: string, now: number): PinAttempt {
  // While locked, nothing is evaluated – not even the correct PIN.
  if (isLocked(state, now)) {
    return { result: 'LOCKED', retryInMs: state.lockedUntil! - now, state }
  }

  // Lock expired → start with a clean counter.
  const current = state.lockedUntil !== null ? initialPinState : state

  if (entered === expected) {
    return { result: 'OK', state: initialPinState }
  }

  const failedAttempts = current.failedAttempts + 1
  if (failedAttempts >= MAX_ATTEMPTS) {
    return { result: 'LOCKED', retryInMs: LOCK_MS, state: { failedAttempts, lockedUntil: now + LOCK_MS } }
  }

  return {
    result: 'WRONG',
    attemptsLeft: MAX_ATTEMPTS - failedAttempts,
    state: { failedAttempts, lockedUntil: null },
  }
}
