// Inline SVG icons (stroke = currentColor), decorative only.
const base = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" {...base}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
)

export const CheckIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="2.4" {...base}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
)

export const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </svg>
)

export const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2.2" {...base}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

export const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
)

export const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...base}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)

// ── navigation & shell (Obsidian redesign) – drawn after the Material Symbols used in the Stitch design ──
type IconProps = { size?: number }

export const WalletIcon = ({ size = 22 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="1.8" {...base}>
    <rect x="3" y="5" width="18" height="15" rx="2.5" />
    <path d="M3 9h12.5a2.5 2.5 0 0 1 0 5H21" />
    <path d="M16 11.5h.01" />
    <path d="M6 5V4a1 1 0 0 1 1.3-.95L16 5" />
  </svg>
)

export const CardIcon = ({ size = 22 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="1.8" {...base}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M3 10h18M7 15h4" />
  </svg>
)

export const PaperPlaneIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="1.8" {...base}>
    <path d="M4 4l17 8-17 8 3-8-3-8z" />
    <path d="M7 12h14" />
  </svg>
)

export const StatsIcon = ({ size = 22 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="1.8" {...base}>
    <path d="M4 20h16" />
    <path d="M6 16v-3M10 16V9M14 16v-5M18 16V6" />
    <path d="M5 9l5-4 4 3 5-4" />
  </svg>
)

export const LockIcon = ({ size = 22 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="1.8" {...base}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" />
  </svg>
)

/** Brand mark: a "Q" with a mint tail on an obsidian tile (replaces the raster logo of the Stitch export). */
export const QavantMark = ({ size = 32 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient id="qv-edge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#a88bff" />
        <stop offset="1" stopColor="#3fe0c5" />
      </linearGradient>
    </defs>
    <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="8.5" fill="#100e19" stroke="url(#qv-edge)" strokeOpacity="0.8" strokeWidth="1.5" />
    <circle cx="15.5" cy="15" r="7" fill="none" stroke="#a88bff" strokeWidth="3" />
    <path d="M18.6 18.1l4.9 4.9" stroke="#3fe0c5" strokeWidth="3" strokeLinecap="round" />
  </svg>
)
