// App shell of the redesign (#61): header, bottom navigation, tab screens – and no third-party requests.
import { expect, test } from './fixtures.ts'
import { expectNoA11yViolations } from './support/axe.ts'
import { mockBank } from './support/mock-bank.ts'

const TABS = [
  { id: 'home', label: 'Home', path: /\/$/, screen: 'dashboard-screen' },
  { id: 'cards', label: 'Cards', path: /\/cards$/, screen: 'cards-screen' },
  { id: 'send', label: 'Send', path: /\/transfer$/, screen: 'transfer-screen' },
  { id: 'stats', label: 'Stats', path: /\/stats$/, screen: 'stats-screen' },
  { id: 'vaults', label: 'Vaults', path: /\/vaults$/, screen: 'vaults-screen' },
] as const

test.describe('App shell · redesign foundation (mocked API)', () => {
  test('every tab of the bottom navigation opens its screen and marks itself as current @smoke @p1', async ({ page, dashboard }) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/')
    await expect(dashboard.balance).toBeVisible()

    for (const tab of TABS) {
      if (tab.id === 'send') continue // full-screen flow without the nav, checked below
      await page.getByTestId(`nav-${tab.id}`).click()
      await expect(page).toHaveURL(tab.path)
      await expect(page.getByTestId(tab.screen)).toBeVisible()
      await expect(page.getByTestId(`nav-${tab.id}`)).toHaveAttribute('aria-current', 'page')
      await expect(page.getByTestId('app-header-label')).toHaveText(tab.label)
      // exactly one tab is current
      await expect(page.locator('[data-testid^="nav-"][aria-current="page"]')).toHaveCount(1)
    }
  })

  test('Send tab opens the transfer flow; browser Back returns to the tab @p2', async ({ page, transfer }) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/stats')
    await page.getByTestId('nav-send').click()
    await expect(transfer.form).toBeVisible()
    await page.goBack()
    await expect(page.getByTestId('stats-screen')).toBeVisible()
  })

  test('navigation works with the keyboard alone @a11y @p2', async ({ page, dashboard }) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/')
    await expect(dashboard.balance).toBeVisible()

    await page.getByTestId('nav-cards').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('cards-screen')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Cards' })).toHaveAttribute('aria-current', 'page')
  })

  test('tab screens pass axe WCAG 2.2 AA @a11y @p2', async ({ page, dashboard }, testInfo) => {
    await mockBank(page, { loggedIn: true })
    await page.goto('/')
    await expect(dashboard.balance).toBeVisible()
    await expectNoA11yViolations(page, testInfo, 'shell-home')
    for (const id of ['cards', 'stats', 'vaults']) {
      await page.getByTestId(`nav-${id}`).click()
      await expect(page.getByTestId(`${id}-screen`)).toBeVisible()
      await expectNoA11yViolations(page, testInfo, `shell-${id}`)
    }
  })

  test('the app loads nothing from third parties – fonts, icons and images are self-hosted @security @p1', async ({ page, pin, baseURL }) => {
    const origin = new URL(baseURL!).origin
    const foreign: string[] = []
    page.on('request', (r) => {
      const url = new URL(r.url())
      if (url.origin !== origin && !url.protocol.startsWith('data')) foreign.push(r.url())
    })
    await mockBank(page)
    await pin.open()
    await pin.enter('1234')
    await page.getByTestId('nav-cards').click()
    await page.evaluate(() => document.fonts.ready)

    expect(foreign).toEqual([]) // no Google Fonts, no CDN, no hot-linked photos (GDPR, CSP #37)
    expect(await page.evaluate(() => document.fonts.check('16px "Space Grotesk"'))).toBe(true)
    expect(await page.evaluate(() => document.fonts.check('16px "Hanken Grotesk"'))).toBe(true)
  })

  test('favicon and home-screen icon are served and declared @p3', async ({ page, request, pin }) => {
    await mockBank(page)
    await pin.open()
    expect(await page.locator('link[rel="icon"]').getAttribute('href')).toBe('/favicon.svg')
    expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).toBe('/apple-touch-icon.png')
    expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#0b0a12')

    const svg = await request.get('/favicon.svg')
    expect(svg.status()).toBe(200)
    expect(await svg.text()).toContain('#a88bff') // the Ion Violet mark, not the old lime one
    const png = await request.get('/apple-touch-icon.png')
    expect(png.status()).toBe(200)
    expect((await png.body()).subarray(1, 4).toString()).toBe('PNG')
  })
})
