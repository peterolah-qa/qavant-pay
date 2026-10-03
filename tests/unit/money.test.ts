import { describe, expect, it } from 'vitest'
import { formatCents, parseAmount } from '@qavant-pay/core'

describe('why cents (documentation test)', () => {
  it('floats cannot represent money exactly', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(19.99 * 100).not.toBe(1999)
  })

  it('parseAmount avoids the float trap', () => {
    const a = parseAmount('0.1')
    const b = parseAmount('0.2')
    expect(a.ok && b.ok && a.cents + b.cents).toBe(30)
  })
})

describe('parseAmount – valid (BR-03)', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,50', 1250], // Slovak decimal comma
    [' 1 234.56 ', 123456], // thousands separator
    ['19.99', 1999], // 19.99 * 100 = 1998.999… in floats
    ['4.35', 435], // 4.35 * 100 = 434.999… in floats
    ['0.01', 1], // smallest valid amount
    ['1000000.00', 100_000_000], // exactly the maximum
  ])('%j → %i cents', (input, cents) => {
    expect(parseAmount(input)).toEqual({ ok: true, cents })
  })
})

describe('parseAmount – invalid (BR-03)', () => {
  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['abc', 'FORMAT'],
    ['1.2.3', 'FORMAT'],
    ['1e3', 'FORMAT'],
    ['€10', 'FORMAT'],
    ['0.001', 'PRECISION'], // 3 decimals
    ['0', 'NOT_POSITIVE'],
    ['0.00', 'NOT_POSITIVE'],
    ['-1', 'NOT_POSITIVE'],
    ['1000000.01', 'TOO_LARGE'], // max + 1 cent
  ])('%j → %s', (input, reason) => {
    expect(parseAmount(input)).toEqual({ ok: false, reason })
  })
})

describe('formatCents', () => {
  it.each([
    [428052, '€4,280.52'],
    [1, '€0.01'],
    [200_000, '€2,000.00'],
  ])('%i → %s', (cents, text) => {
    expect(formatCents(cents)).toBe(text)
  })
})
