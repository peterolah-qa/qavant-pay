// /transfer – a three-step flow: form → review → done. The draft survives "Edit transfer".
import { EMPTY_DRAFT, type TransferDraft, type TransferInput } from '@qavant-pay/core'
import { useEffect, useState } from 'react'
import { api, type Account, type TransferReceipt } from '../../api/client.ts'
import { navigate } from '../../router.ts'
import styles from './Transfer.module.css'
import { TransferForm } from './TransferForm.tsx'
import { TransferReview } from './TransferReview.tsx'
import { TransferSuccess } from './TransferSuccess.tsx'

type Step =
  | { kind: 'form' }
  // one Idempotency-Key per review: every retry of THIS transfer reuses it, an edited transfer gets a new one
  | { kind: 'review'; input: TransferInput; bank: string | null; idempotencyKey: string }
  | { kind: 'done'; input: TransferInput; receipt: TransferReceipt }

type AccountState = { kind: 'loading' } | { kind: 'ready'; account: Account } | { kind: 'error' }

export function TransferScreen({ onSessionLost }: { onSessionLost: () => void }) {
  const [account, setAccount] = useState<AccountState>({ kind: 'loading' })
  const [draft, setDraft] = useState<TransferDraft>(EMPTY_DRAFT)
  const [step, setStep] = useState<Step>({ kind: 'form' })

  useEffect(() => {
    let cancelled = false
    void api.account().then((res) => {
      if (cancelled) return
      if (res.ok) setAccount({ kind: 'ready', account: res.data })
      else if (res.error.status === 401) onSessionLost()
      else setAccount({ kind: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [onSessionLost])

  if (account.kind !== 'ready') {
    return (
      <main className={styles.screen} data-testid="transfer-screen" aria-busy={account.kind === 'loading'}>
        {account.kind === 'error' && (
          <p role="alert" data-testid="transfer-load-error">
            Could not load your account.
          </p>
        )}
      </main>
    )
  }

  switch (step.kind) {
    case 'form':
      return (
        <TransferForm
          balanceCents={account.account.balanceCents}
          draft={draft}
          onChange={setDraft}
          onBack={() => navigate('/')}
          onReview={(input, bank) => setStep({ kind: 'review', input, bank, idempotencyKey: crypto.randomUUID() })}
        />
      )
    case 'review':
      return (
        <TransferReview
          account={account.account}
          input={step.input}
          bank={step.bank}
          idempotencyKey={step.idempotencyKey}
          onEdit={() => setStep({ kind: 'form' })}
          onSent={(receipt) => setStep({ kind: 'done', input: step.input, receipt })}
          onSessionLost={onSessionLost}
        />
      )
    case 'done':
      return <TransferSuccess input={step.input} receipt={step.receipt} onDone={() => navigate('/')} />
  }
}
