// Display formatting shared by the screens. Dates are shown in the BANK's time zone (Europe/Bratislava),
// the same one the daily limit uses – so "Today" in the app and "today" for the limit always agree.
import { BANK_TIME_ZONE, formatCents, localDay } from '@qavant-pay/core'

/** -3890 → "−€38.90", 12000 → "+€120.00" (real minus sign U+2212, not a hyphen) */
export function signedCents(amountCents: number): string {
  return `${amountCents < 0 ? '−' : '+'}${formatCents(Math.abs(amountCents))}`
}

const time = new Intl.DateTimeFormat('en-GB', { timeZone: BANK_TIME_ZONE, hour: '2-digit', minute: '2-digit' })
const shortDate = new Intl.DateTimeFormat('en-GB', { timeZone: BANK_TIME_ZONE, day: 'numeric', month: 'short' })
const shortDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: BANK_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const fullDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: BANK_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** "17:42" */
export const formatTime = (iso: string) => time.format(new Date(iso))
/** "3 Oct, 17:42" */
export const formatShortDateTime = (iso: string) => shortDateTime.format(new Date(iso))
/** "3 Oct 2026, 17:42" */
export const formatFullDateTime = (iso: string) => fullDateTime.format(new Date(iso))

/** Group heading in the history: "Today", "Yesterday" or "26 Sep". */
export function dayLabel(iso: string, now = new Date()): string {
  const day = localDay(new Date(iso))
  if (day === localDay(now)) return 'Today'
  if (day === localDay(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return 'Yesterday'
  return shortDate.format(new Date(iso))
}
