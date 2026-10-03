// IBAN validation for Slovak accounts (ISO 13616, mod-97).
// Pure function: no I/O, no framework → trivially unit-testable.

export type IbanError = 'EMPTY' | 'CHARACTERS' | 'COUNTRY' | 'LENGTH' | 'CHECKSUM'

export type IbanResult =
  | { valid: true; iban: string; formatted: string; bankCode: string; bank: string | null }
  | { valid: false; reason: IbanError }

const SK_LENGTH = 24

// Bank code = characters 5–8 of a Slovak IBAN.
const SK_BANKS: Record<string, string> = {
  '0200': 'Všeobecná úverová banka',
  '0900': 'Slovenská sporiteľňa',
  '1100': 'Tatra banka',
  '5600': 'Prima banka',
  '6500': '365.bank',
  '7500': 'ČSOB',
  '8360': 'mBank',
}

/** Removes spaces and uppercases: "sk64 0900 …" → "SK640900…" */
export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase()
}

/** "SK6409000000005123456789" → "SK64 0900 0000 0051 2345 6789" */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})(?=.)/g, '$1 ')
}

/**
 * ISO 13616 check: move the first 4 chars to the end, letters → numbers (A=10 … Z=35),
 * the whole number mod 97 must equal 1. Computed digit by digit so it never overflows.
 */
export function hasValidChecksum(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const ch of rearranged) {
    const value = parseInt(ch, 36) // '0'-'9' → 0-9, 'A'-'Z' → 10-35
    remainder = Number(`${remainder}${value}`) % 97
  }
  return remainder === 1
}

export function validateIban(input: string): IbanResult {
  const iban = normalizeIban(input)

  if (iban === '') return { valid: false, reason: 'EMPTY' }
  if (!/^[A-Z0-9]+$/.test(iban)) return { valid: false, reason: 'CHARACTERS' }
  if (!iban.startsWith('SK')) return { valid: false, reason: 'COUNTRY' }
  if (iban.length !== SK_LENGTH) return { valid: false, reason: 'LENGTH' }
  if (!/^SK\d{22}$/.test(iban)) return { valid: false, reason: 'CHARACTERS' }
  if (!hasValidChecksum(iban)) return { valid: false, reason: 'CHECKSUM' }

  const bankCode = iban.slice(4, 8)
  return {
    valid: true,
    iban,
    formatted: formatIban(iban),
    bankCode,
    bank: SK_BANKS[bankCode] ?? null,
  }
}
