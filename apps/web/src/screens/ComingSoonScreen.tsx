// Tabs whose screens arrive in later redesign steps. Honest about it, in the same visual language.
import type { ReactNode } from 'react'
import styles from './ComingSoonScreen.module.css'

type Props = { id: string; icon: ReactNode; title: string; text: string; issue: string; features: string[] }

export function ComingSoonScreen({ id, icon, title, text, issue, features }: Props) {
  return (
    <section className={`cyber-card cyber-corners scanlines ${styles.card}`} data-testid={`${id}-screen`} aria-labelledby={`${id}-title`}>
      <div className={styles.halo} aria-hidden="true" />
      <div className={styles.icon} aria-hidden="true">
        {icon}
      </div>
      <p className={styles.kicker}>In development · {issue}</p>
      <h1 id={`${id}-title`} className={styles.title}>
        {title}
      </h1>
      <p className={styles.text}>{text}</p>
      <ul className={styles.list}>
        {features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </section>
  )
}
