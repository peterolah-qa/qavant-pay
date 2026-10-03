import styles from './PinScreen.module.css'

// Phase 0: static layout + test ids. Logic (digits, lockout) comes in phase 2.
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
const PIN_LENGTH = 4

export function PinScreen() {
  return (
    <main className={styles.screen} data-testid="pin-screen">
      <header className={styles.brand}>
        <div className={styles.logo} aria-hidden="true">Q</div>
        <h1 className={styles.title}>Qavant Pay</h1>
        <p className={styles.subtitle}>Enter your 4-digit PIN</p>
        <p className={styles.demoPin} data-testid="pin-demo-hint">Demo PIN: 1234</p>
      </header>

      <div className={styles.dots} role="status" aria-label="0 of 4 digits entered">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} className={styles.dot} data-testid={`pin-dot-${i + 1}`} />
        ))}
      </div>

      <div className={styles.keypad}>
        {KEYS.map((k) => (
          <button key={k} type="button" className={styles.key} data-testid={`pin-key-${k}`}>{k}</button>
        ))}
        <span aria-hidden="true" />
        <button type="button" className={styles.key} data-testid="pin-key-0">0</button>
        <button type="button" className={`${styles.key} ${styles.ghost}`} aria-label="Delete digit" data-testid="pin-backspace">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5h11v14H9l-6-7z" />
            <path d="M13 9.5l5 5M18 9.5l-5 5" />
          </svg>
        </button>
      </div>
    </main>
  )
}
