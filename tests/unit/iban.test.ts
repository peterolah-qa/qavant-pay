import { describe, expect, it } from 'vitest'
import { formatIban, normalizeIban, validateIban } from '@qavant-pay/core'

describe('validateIban – valid Slovak IBANs', () => {
  it.each([
    // input,                              normalized,                 bank
    ['SK64 0900 0000 0051 2345 6789', 'SK6409000000005123456789', 'Slovenská sporiteľňa'],
    ['sk6409000000005123456789',      'SK6409000000005123456789', 'Slovenská sporiteľňa'],
    ['  SK31 0200 0000 0019 8742 6375 ', 'SK3102000000001987426375', 'Všeobecná úverová banka'],
    ['SK75 1100 0000 0029 4411 0077', 'SK7511000000002944110077', 'Tatra banka'],
  ])('%s → valid (%s, %s)', (input, iban, bank) => {
    const result = validateIban(input)
    expect(result).toMatchObject({ valid: true, iban, bank })
  })

  it('valid checksum but unknown bank code → valid, bank = null', () => {
    expect(validateIban('SK17 9999 0000 0012 3456 7890')).toMatchObject({
      valid: true,
      bankCode: '9999',
      bank: null,
    })
  })
})

describe('validateIban – invalid input (BR-02)', () => {
  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['SK64-0900-0000-0051-2345-6789', 'CHARACTERS'],
    ['CZ6508000000192000145399', 'COUNTRY'],
    ['SK64 0900 0000 0051 2345 678', 'LENGTH'], // 23 chars
    ['SK64 0900 0000 0051 2345 67890', 'LENGTH'], // 25 chars
    ['SK64 0900 0000 0051 2345 678X', 'CHARACTERS'],
    ['SK65 0900 0000 0051 2345 6789', 'CHECKSUM'], // check digits off by one
    ['SK64 0900 0000 0051 2345 6798', 'CHECKSUM'], // two digits swapped (typo)
  ])('%j → %s', (input, reason) => {
    expect(validateIban(input)).toEqual({ valid: false, reason })
  })
})

describe('helpers', () => {
  it('normalizeIban strips whitespace and uppercases', () => {
    expect(normalizeIban(' sk64 0900\t0000 ')).toBe('SK6409000000')
  })

  it('formatIban groups by 4', () => {
    expect(formatIban('SK6409000000005123456789')).toBe('SK64 0900 0000 0051 2345 6789')
  })
})
