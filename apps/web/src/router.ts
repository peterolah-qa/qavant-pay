// A tiny router: real URLs (/transfer, /history, /transactions/:id …), browser Back works, no dependency.
// Netlify serves index.html for every path (netlify.toml), so deep links load the app.
import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

/** Current pathname; the component re-renders when it changes. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

/** path may include a query string: navigate('/history?type=income') */
export function navigate(path: string) {
  if (path === window.location.pathname + window.location.search) return
  window.history.pushState({ inApp: true }, '', path) // marks entries we created ourselves
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/**
 * The in-app Back button: behaves like the browser's Back when we came from inside the app
 * (keeps the history filters), but never leaves the app after a deep link – then it goes to `fallback`.
 */
export function goBack(fallback: string) {
  if ((window.history.state as { inApp?: boolean } | null)?.inApp) window.history.back()
  else navigate(fallback)
}

/** Replaces the query string without a new history entry (filters typed into a screen). */
export function replaceQuery(params: URLSearchParams) {
  const query = params.toString()
  const url = window.location.pathname + (query ? `?${query}` : '')
  window.history.replaceState(window.history.state, '', url)
}

/** "/transactions/tx_ab12cd34_05" → "tx_ab12cd34_05" */
export function matchTransactionPath(path: string): string | null {
  const match = /^\/transactions\/([^/]+)\/?$/.exec(path)
  return match ? decodeURIComponent(match[1]) : null
}
