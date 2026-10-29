// App shell of the redesign: header (brand, screen label, avatar) + floating bottom navigation.
// Used by the tab screens (Home, Cards, Stats, Vaults). Full-screen flows (Send, detail) have their own header.
import type { MouseEvent, ReactNode } from 'react'
import { CardIcon, LockIcon, PaperPlaneIcon, QavantMark, StatsIcon, WalletIcon } from '../icons.tsx'
import { navigate, usePath } from '../router.ts'
import styles from './AppShell.module.css'

const TABS = [
  { path: '/', label: 'Home', icon: <WalletIcon />, id: 'home' },
  { path: '/cards', label: 'Cards', icon: <CardIcon />, id: 'cards' },
  { path: '/transfer', label: 'Send', icon: <PaperPlaneIcon />, id: 'send', round: true },
  { path: '/stats', label: 'Stats', icon: <StatsIcon />, id: 'stats' },
  { path: '/vaults', label: 'Vaults', icon: <LockIcon />, id: 'vaults' },
] as const

const go = (path: string) => (e: MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault()
  navigate(path)
}

/** Initials avatar – no photos: nothing to load from a third party, nothing personal to leak. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size }} aria-hidden="true">
      {name.trim().slice(0, 1).toUpperCase() || '?'}
      <span className={styles.onlineDot} />
    </span>
  )
}

export function AppHeader({ label, holder = 'Peter' }: { label: string; holder?: string }) {
  return (
    <header className={styles.header} data-testid="app-header">
      <div className={styles.brand}>
        <QavantMark />
        <div className={styles.brandText}>
          <span className={styles.brandName}>Qavant</span>
          <span className={styles.brandLabel} data-testid="app-header-label">
            {label}
          </span>
        </div>
      </div>
      <Avatar name={holder} />
    </header>
  )
}

export function BottomNav() {
  const path = usePath()
  return (
    <nav className={styles.nav} aria-label="Main" data-testid="bottom-nav">
      <div className={styles.navBar}>
        {TABS.map((tab) => {
          const active = tab.path === '/' ? path === '/' : path.startsWith(tab.path)
          return (
            <a
              key={tab.id}
              href={tab.path}
              onClick={go(tab.path)}
              className={`${styles.tab} ${active ? styles.active : ''}`}
              aria-current={active ? 'page' : undefined}
              data-testid={`nav-${tab.id}`}
            >
              {'round' in tab ? <span className={styles.round}>{tab.icon}</span> : tab.icon}
              <span className={styles.tabLabel}>{tab.label}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}

export function AppShell({ label, holder, children }: { label: string; holder?: string; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <AppHeader label={label} holder={holder} />
      <div className={styles.content}>{children}</div>
      <BottomNav />
    </div>
  )
}
