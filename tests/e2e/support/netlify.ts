// Netlify injects its own review tooling – the "Netlify Drawer" – into DEPLOY PREVIEWS only.
// It floats over the bottom of the page and intercepts clicks on our bottom navigation, and it loads
// from netlify.com (a third-party request). Production and local runs never have it. See docs/journal.md 3.4, R.1.

/** True for a deploy preview URL (https://deploy-preview-71--qavant-pay.netlify.app). */
export const isDeployPreview = (baseURL?: string) => !!baseURL && /deploy-preview-\d+--/.test(baseURL)

/** Netlify's own tooling: any *.netlify.com / *.netlify.app host other than the app itself. */
export function isNetlifyTooling(url: URL, appHost: string): boolean {
  return url.host !== appHost && /(^|\.)netlify\.(com|app)$/.test(url.hostname)
}
