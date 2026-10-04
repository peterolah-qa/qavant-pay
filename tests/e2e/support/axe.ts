// Accessibility check with axe-core: WCAG 2.2 A + AA rules on the current page state.
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, type TestInfo } from '@playwright/test'

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/**
 * Fails the test on ANY WCAG A/AA violation and prints them readably:
 *   [serious] color-contrast · Elements must meet minimum color contrast ratio thresholds
 *     → #amount-status > span  (contrast 3.9:1, needs 4.5:1)
 * The full axe JSON is attached to the HTML report for debugging.
 */
export async function expectNoA11yViolations(page: Page, testInfo: TestInfo, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  await testInfo.attach(`axe-${label}.json`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })

  const report = results.violations.map((v) => {
    const nodes = v.nodes.map((n) => `    → ${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`).join('\n')
    return `[${v.impact}] ${v.id} · ${v.help}\n${nodes}`
  })
  expect(report, `${label}: WCAG violations\n${report.join('\n')}`).toEqual([])
}
