import { defineConfig, devices } from '@playwright/test'

// BASE_URL is set in CI (deploy preview or production).
// Locally it is empty → Playwright builds the app and serves it with `vite preview`.
const BASE_URL = process.env.BASE_URL || 'http://localhost:4173'
const isLocal = BASE_URL.includes('localhost')

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'api', testDir: './tests/api' },
    { name: 'mobile-chrome', testDir: './tests/e2e', use: { ...devices['Pixel 7'] } },
  ],
  webServer: isLocal
    ? {
        command: 'npm run build && npm run preview -w apps/web -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
})
