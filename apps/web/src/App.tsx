import { useCallback, useEffect, useState } from 'react'
import { api } from './api/client.ts'
import { matchTransactionPath, usePath } from './router.ts'
import { DashboardScreen } from './screens/DashboardScreen.tsx'
import { HistoryScreen } from './screens/history/HistoryScreen.tsx'
import { TransactionDetailScreen } from './screens/history/TransactionDetailScreen.tsx'
import { NotFoundScreen } from './screens/NotFoundScreen.tsx'
import { ComingSoonScreen } from './screens/ComingSoonScreen.tsx'
import { AppShell } from './shell/AppShell.tsx'
import { CardIcon, LockIcon, StatsIcon } from './icons.tsx'
import { PinScreen } from './screens/PinScreen.tsx'
import { TransferScreen } from './screens/transfer/TransferScreen.tsx'

type Stage = 'loading' | 'pin' | 'app' | 'error'

/**
 * Where does the visitor start? ONE request (it used to be two in a row: GET /api/account → 401 →
 * POST /api/demo/session). The server answers 'app' (PIN already entered – with the dashboard data)
 * or 'pin' (and creates a fresh sandbox if there was none).
 */
async function resolveStage(): Promise<Stage> {
  const start = await api.session()
  if (!start.ok) return 'error'
  return start.data.stage === 'app' ? 'app' : 'pin'
}

/** Screens behind the PIN. The URL survives the login: a deep link to /transfer lands on /transfer. */
function Routes({ onSessionLost }: { onSessionLost: () => void }) {
  const path = usePath()
  if (path === '/')
    return (
      <AppShell label="Home">
        <DashboardScreen onSessionLost={onSessionLost} />
      </AppShell>
    )
  if (path === '/cards')
    return (
      <AppShell label="Cards">
        <ComingSoonScreen
          id="cards"
          icon={<CardIcon size={26} />}
          issue="#65"
          title="Cards hub"
          text="Your virtual card with real controls, stored on the server."
          features={['Reveal the card number after PIN / passkey', 'Freeze, online, ATM and wallet switches', 'Monthly spending limit', 'One-time burner cards and a rotating card number']}
        />
      </AppShell>
    )
  if (path === '/stats')
    return (
      <AppShell label="Stats">
        <ComingSoonScreen
          id="stats"
          icon={<StatsIcon size={26} />}
          issue="#67"
          title="Spending analytics"
          text="Where your money goes, computed from your own ledger."
          features={['Income vs spending this month', 'Spending by category and top merchants', 'Daily trend']}
        />
      </AppShell>
    )
  if (path === '/vaults')
    return (
      <AppShell label="Vaults">
        <ComingSoonScreen
          id="vaults"
          icon={<LockIcon size={26} />}
          issue="#68"
          title="Savings vaults"
          text="Put money aside for a goal – by hand or automatically."
          features={['Vaults with a goal and progress', 'Deposit and withdraw', 'Round-up of card payments']}
        />
      </AppShell>
    )
  if (path === '/transfer') return <TransferScreen onSessionLost={onSessionLost} />
  if (path === '/history') return <HistoryScreen onSessionLost={onSessionLost} />
  const txId = matchTransactionPath(path)
  // key: a different id is a different screen (fresh loading state, no stale data)
  if (txId) return <TransactionDetailScreen key={txId} id={txId} onSessionLost={onSessionLost} />
  return <NotFoundScreen />
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
