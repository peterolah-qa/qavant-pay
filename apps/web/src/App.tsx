import { useCallback, useEffect, useState } from 'react'
import { api } from './api/client.ts'
import { DashboardScreen } from './screens/DashboardScreen.tsx'
import { PinScreen } from './screens/PinScreen.tsx'

type Stage = 'loading' | 'pin' | 'dashboard' | 'error'

/**
 * Where does the visitor start?
 *   account 200          → already logged in → dashboard
 *   401 PIN_REQUIRED     → session exists     → PIN
 *   401 (no/old session) → create a sandbox   → PIN
 */
async function resolveStage(): Promise<Stage> {
  const account = await api.account()
  if (account.ok) return 'dashboard'
  if (account.error.code === 'PIN_REQUIRED') return 'pin'
  if (account.error.status === 401) return (await api.startSession()).ok ? 'pin' : 'error'
  return 'error'
}

export default function App() {
  const [stage, setStage] = useState<Stage>('loading')

  const load = useCallback(() => {
    void resolveStage().then(setStage)
  }, [])

  // after a lost session or a failed start: show the spinner again and re-resolve
  const restart = useCallback(() => {
    setStage('loading')
    load()
  }, [load])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <div className="demo-banner" data-testid="demo-banner">
        Demo app · no real money
      </div>

      {stage === 'loading' && (
        <main className="center" data-testid="app-loading" aria-busy="true">
          Loading…
        </main>
      )}

      {stage === 'error' && (
        <main className="center" data-testid="app-error">
          <p role="alert">Qavant Pay is not reachable right now.</p>
          <button type="button" className="text-button" onClick={restart}>
            Try again
          </button>
        </main>
      )}

      {stage === 'pin' && <PinScreen onSuccess={() => setStage('dashboard')} onSessionLost={restart} />}
      {stage === 'dashboard' && <DashboardScreen onSessionLost={restart} />}
    </>
  )
}
