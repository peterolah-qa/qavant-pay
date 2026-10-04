import { formatCents, type TransferInput } from '@qavant-pay/core'
import { useEffect, useRef } from 'react'
import type { TransferReceipt } from '../../api/client.ts'
import { CheckIcon } from './icons.tsx'
import styles from './Transfer.module.css'

type Props = { input: TransferInput; receipt: TransferReceipt; onDone: () => void }

export function TransferSuccess({ input, receipt, onDone }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  // screen readers announce the result; keyboard users continue from here
  useEffect(() => heading.current?.focus(), [])

  return (
    <main className={`${styles.screen} ${styles.success}`} data-testid="transfer-success">
      <div className={styles.successIcon} aria-hidden="true">
        <CheckIcon size={36} />
      </div>
      <h1 ref={heading} tabIndex={-1} className={styles.title}>
        Money sent
      </h1>
      <p className={styles.successText} data-testid="success-summary">
        {formatCents(input.amountCents)} to {input.recipientName}
      </p>
      <p className={styles.hint}>
        New balance <strong data-testid="success-balance">{formatCents(receipt.balanceCents)}</strong>
      </p>
      <p className={styles.reference} data-testid="success-reference">
        Ref. {receipt.transaction.id}
      </p>
      <button type="button" className={styles.primary} data-testid="success-done" onClick={onDone}>
        Done
      </button>
    </main>
  )
}
