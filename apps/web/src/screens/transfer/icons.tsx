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
