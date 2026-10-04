import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client.ts'
import styles from './PinScreen.module.css'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
const PIN_LENGTH = 4

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'wrong'; attemptsLeft: number }
  | { kind: 'locked'; until: number } // epoch ms, from the server's retryInMs
  | { kind: 'error' }

type Props = { onSuccess: () => void; onSessionLost: () => void }

export function PinScreen({ onSuccess, onSessionLost }: Props) {
  const [digits, setDigits] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [now, setNow] = useState(() => Date.now())
  const [shakeId, setShakeId] = useState(0)

  const secondsLeft = status.kind === 'locked' ? Math.max(0, Math.ceil((status.until - now) / 1000)) : 0
  const locked = secondsLeft > 0 // derived: the lock ends by itself when the countdown reaches 0
  const busy = status.kind === 'checking' || locked

  // Lockout countdown – driven by Date.now(), so Playwright's page.clock can fast-forward it.
  useEffect(() => {
    if (!locked) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [locked])

  const submit = useCallback(
    async (pin: string) => {
      setStatus({ kind: 'checking' })
      const result = await api.enterPin(pin)
      setDigits('')

      if (result.ok) return onSuccess()

      const { code, attemptsLeft, retryInMs } = result.error
      if (code === 'WRONG_PIN') {
        setStatus({ kind: 'wrong', attemptsLeft: attemptsLeft ?? 0 })
        setShakeId((id) => id + 1)
      } else if (code === 'PIN_LOCKED') {
        const start = Date.now()
        setNow(start)
        setStatus({ kind: 'locked', until: start + (retryInMs ?? 30_000) })
        setShakeId((id) => id + 1)
      } else if (code === 'UNAUTHENTICATED' || code === 'SESSION_EXPIRED') {
        onSessionLost()
      } else {
        setStatus({ kind: 'error' })
      }
    },
    [onSuccess, onSessionLost],
  )

  const press = useCallback(
    (digit: string) => {
      if (busy || digits.length >= PIN_LENGTH) return
      if (status.kind !== 'idle') setStatus({ kind: 'idle' }) // clear old message / expired lock
      const next = digits + digit
      setDigits(next)
      if (next.length === PIN_LENGTH) void submit(next)
    },
    [busy, digits, status.kind, submit],
  )

  const backspace = useCallback(() => {
    if (!busy) setDigits((d) => d.slice(0, -1))
  }, [busy])

  // Physical keyboard: digits and Backspace (desktop users, accessibility, E2E).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') backspace()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press, backspace])

  return (
    <main className={styles.screen} data-testid="pin-screen">
      <header className={styles.brand}>
        <div className={styles.logo} aria-hidden="true">
          Q
        </div>
        <h1 className={styles.title}>Qavant Pay</h1>
        <p className={styles.subtitle}>Enter your 4-digit PIN</p>
        <p className={styles.demoPin} data-testid="pin-demo-hint">
          Demo PIN: 1234
        </p>
      </header>

      <div className={styles.feedback}>
        <div
          key={shakeId}
          className={`${styles.dots} ${shakeId > 0 ? styles.shake : ''}`}
          role="status"
          aria-label={`${digits.length} of ${PIN_LENGTH} digits entered`}
        >
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`${styles.dot} ${i < digits.length ? styles.filled : ''}`}
              data-testid={`pin-dot-${i + 1}`}
              data-filled={i < digits.length}
            />
          ))}
        </div>

        {status.kind === 'wrong' && (
          <p className={styles.warning} role="alert" data-testid="pin-error">
            Wrong PIN · {status.attemptsLeft} {status.attemptsLeft === 1 ? 'attempt' : 'attempts'} left
          </p>
        )}
        {locked && (
          <p className={styles.danger} role="alert" data-testid="pin-lock-countdown">
            Too many attempts · try again in {secondsLeft} s
          </p>
        )}
        {status.kind === 'error' && (
          <p className={styles.danger} role="alert" data-testid="pin-error">
            Connection problem · please try again
          </p>
        )}
      </div>

      <div className={styles.keypad}>
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={styles.key}
            data-testid={`pin-key-${k}`}
            disabled={busy}
            onClick={() => press(k)}
          >
            {k}
          </button>
        ))}
        <span aria-hidden="true" />
        <button type="button" className={styles.key} data-testid="pin-key-0" disabled={busy} onClick={() => press('0')}>
          0
        </button>
        <button
          type="button"
          className={`${styles.key} ${styles.ghost}`}
          aria-label="Delete digit"
          data-testid="pin-backspace"
          disabled={busy}
          onClick={backspace}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5h11v14H9l-6-7z" />
            <path d="M13 9.5l5 5M18 9.5l-5 5" />
          </svg>
        </button>
      </div>
    </main>
  )
}
