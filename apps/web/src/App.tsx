import { useCallback, useEffect, useState } from 'react'
import { api } from './api/client.ts'
import { usePath } from './router.ts'
import { DashboardScreen } from './screens/DashboardScreen.tsx'
import { PinScreen } from './screens/PinScreen.tsx'
import { TransferScreen } from './screens/transfer/TransferScreen.tsx'

type Stage = 'loading' | 'pin' | 'app' | 'error'

/**
 * Where does the visitor start?
 *   account 200          → already logged in → the app
 *   401 PIN_REQUIRED     → session exists     → PIN
 *   401 (no/old session) → create a sandbox   → PIN
 */
async function resolveStage(): Promise<Stage> {
  const account = await api.account()
  if (account.ok) return 'app'
  if (account.error.code === 'PIN_REQUIRED') return 'pin'
  if (account.error.status === 401) return (await api.startSession()).ok ? 'pin' : 'error'
  return 'error'
}

/** Screens behind the PIN. The URL survives the login: a deep link to /transfer lands on /transfer. */
function Routes({ onSessionLost }: { onSessionLost: () => void }) {
  const path = usePath()
  if (path === '/transfer') return <TransferScreen onSessionLost={onSessionLost} />
  return <DashboardScreen onSessionLost={onSessionLost} />
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

      {stage === 'pin' && <PinScreen onSuccess={() => setStage('app')} onSessionLost={restart} />}
      {stage === 'app' && <Routes onSessionLost={restart} />}
    </>
  )
}
