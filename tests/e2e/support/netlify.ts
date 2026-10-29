// Netlify injects its own review tooling – the "Netlify Drawer" – into DEPLOY PREVIEWS only.
// It floats over the bottom of the page and intercepts clicks on our bottom navigation, and its iframe loads
// from app.netlify.com (a third-party request). Production and local runs never have it.
// See docs/journal.md 3.4, R.1 and R.3 (why blocking requests and page CSS were not enough).

/** True for a deploy preview URL (https://deploy-preview-71--qavant-pay.netlify.app). */
export const isDeployPreview = (baseURL?: string) => !!baseURL && /deploy-preview-\d+--/.test(baseURL)

/** Netlify's own tooling: any *.netlify.com / *.netlify.app host other than the app itself. */
export function isNetlifyTooling(url: URL, appHost: string): boolean {
  return url.host !== appHost && /(^|\.)netlify\.(com|app)$/.test(url.hostname)
}

/** What the drawer looks like in the DOM (from the CI log): a host div with the deploy id, the iframe by title. */
export const DRAWER_SELECTOR = '[data-netlify-deploy-id], iframe[title="Netlify Drawer"]'

/**
 * Runs in the page before any of its scripts (page.addInitScript) and removes the drawer as soon as it appears.
 * The drawer is injected from the app's own origin and lives in a shadow root, so neither blocking netlify.com
 * nor a page stylesheet reaches it. Shadow roots are watched too – including closed ones, by wrapping
 * attachShadow before the drawer script runs. Must stay self-contained: it is serialised into the page.
 */
export function removeNetlifyDrawer(selector: string): void {
  const sweep = (root: ParentNode) => root.querySelectorAll(selector).forEach((el) => el.remove())
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue
        if (node.matches(selector)) node.remove()
        else sweep(node)
      }
    }
  })
  observer.observe(document, { childList: true, subtree: true })

  const attachShadow = Element.prototype.attachShadow
  Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
    const root = attachShadow.call(this, init)
    observer.observe(root, { childList: true, subtree: true })
    return root
  }
}
