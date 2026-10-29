// The exception for Netlify's preview tooling must stay narrow – it must never hide a real third-party request.
import { describe, expect, it } from 'vitest'
import { isDeployPreview, isNetlifyTooling } from '../e2e/support/netlify.ts'

const APP = 'deploy-preview-71--qavant-pay.netlify.app'

describe('Netlify preview tooling filter', () => {
  it('recognises deploy previews only', () => {
    expect(isDeployPreview('https://deploy-preview-71--qavant-pay.netlify.app')).toBe(true)
    expect(isDeployPreview('https://pay.qavant.dev')).toBe(false)
    expect(isDeployPreview('https://qavant-pay.netlify.app')).toBe(false)
    expect(isDeployPreview('http://localhost:4173')).toBe(false)
    expect(isDeployPreview(undefined)).toBe(false)
  })

  it.each([
    ['https://app.netlify.com/drawer.js', true],
    ['https://netlify-cdp-loader.netlify.app/netlify.js', true],
    [`https://${APP}/assets/index.js`, false], // the app itself
    ['https://fonts.googleapis.com/css2?family=Inter', false], // a real third party stays visible
    ['https://evil-netlify.com.attacker.io/x.js', false], // look-alike host
    ['https://netlify.com.evil.app/x.js', false],
  ])('%s → tooling: %s', (url, expected) => {
    expect(isNetlifyTooling(new URL(url), APP)).toBe(expected)
  })
})
