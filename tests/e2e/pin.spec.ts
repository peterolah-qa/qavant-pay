import { test, expect } from '@playwright/test'

test.describe('PIN screen', () => {
  test('renders brand, demo hint and full keypad @smoke @p1', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/Qavant Pay/)
    await expect(page.getByTestId('pin-screen')).toBeVisible()
    await expect(page.getByTestId('demo-banner')).toHaveText(/no real money/i)
    await expect(page.getByTestId('pin-demo-hint')).toHaveText('Demo PIN: 1234')

    for (const digit of '0123456789') {
      await expect(page.getByTestId(`pin-key-${digit}`)).toBeVisible()
    }
    await expect(page.getByTestId(/^pin-dot-\d$/)).toHaveCount(4)
    await expect(page.getByRole('button', { name: 'Delete digit' })).toBeVisible()
  })

  test('deep link falls back to the app (SPA routing) @p2', async ({ page }) => {
    await page.goto('/some/deep/link')
    await expect(page.getByTestId('pin-screen')).toBeVisible()
  })
})
