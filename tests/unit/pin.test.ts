import { describe, expect, it } from 'vitest'
import { LOCK_MS, attemptPin, initialPinState, type PinState } from '@qavant-pay/core'

const PIN = '1234'
const WRONG = '0000'
const T0 = 1_000_000 // arbitrary start time in ms – tests control the clock

/** Enters several PINs at the same moment and returns the last attempt + state. */
function enter(pins: string[], now = T0, start: PinState = initialPinState) {
  let state = start
  let last = attemptPin(state, pins[0], PIN, now)
  state = last.state
  for (const pin of pins.slice(1)) {
    last = attemptPin(state, pin, PIN, now)
    state = last.state
  }
  return { last, state }
}

describe('PIN – attempts (BR-01)', () => {
  it('correct PIN → OK', () => {
    expect(enter([PIN]).last.result).toBe('OK')
  })

  it.each([
    [1, 2],
    [2, 1],
  ])('%i wrong attempt(s) → %i left', (wrongCount, left) => {
    const { last } = enter(Array(wrongCount).fill(WRONG))
    expect(last).toMatchObject({ result: 'WRONG', attemptsLeft: left })
  })

  it('3rd wrong attempt → LOCKED for 30 s', () => {
    expect(enter([WRONG, WRONG, WRONG]).last).toMatchObject({ result: 'LOCKED', retryInMs: LOCK_MS })
  })

  it('correct PIN resets the counter', () => {
    const { last } = enter([WRONG, WRONG, PIN, WRONG])
    expect(last).toMatchObject({ result: 'WRONG', attemptsLeft: 2 })
  })
})

describe('PIN – lockout timing (boundary values)', () => {
  const locked = enter([WRONG, WRONG, WRONG]).state

  it('even the correct PIN is refused while locked', () => {
    expect(attemptPin(locked, PIN, PIN, T0 + 10_000)).toMatchObject({ result: 'LOCKED', retryInMs: 20_000 })
  })

  it('29.999 s after lock → still locked', () => {
    expect(attemptPin(locked, PIN, PIN, T0 + LOCK_MS - 1).result).toBe('LOCKED')
  })

  it('exactly 30 s after lock → unlocked', () => {
    expect(attemptPin(locked, PIN, PIN, T0 + LOCK_MS).result).toBe('OK')
  })

  it('after the lock expires the counter starts again at 3', () => {
    expect(attemptPin(locked, WRONG, PIN, T0 + LOCK_MS)).toMatchObject({ result: 'WRONG', attemptsLeft: 2 })
  })
})

describe('PIN – purity', () => {
  it('never mutates the state it receives', () => {
    const state = { failedAttempts: 1, lockedUntil: null }
    const snapshot = structuredClone(state)
    attemptPin(state, WRONG, PIN, T0)
    expect(state).toEqual(snapshot)
  })
})
