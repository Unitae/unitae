import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/runtime', async importOriginal => ({
  ...(await importOriginal<typeof import('~/i18n/paraglide/runtime')>()),
  getLocale: () => 'fr' as const,
}))

const { formatAbsence, formatListDate, privilegeLabel } = await import('./publisher-list-format')

const PARIS = 'Europe/Paris'
// Node and browsers differ on the spaces around the range dash.
const DECEMBER_RANGE = /^14\s*–\s*21 déc\.$/
const NOW = new Date(Date.UTC(2026, 10, 7, 12))

describe('privilegeLabel', () => {
  it('uses the feminine form of the pioneer tags for a sister', () => {
    expect(privilegeLabel('regular-pioneer', false)).toBe('Pionnière permanente')
    expect(privilegeLabel('regular-pioneer', true)).toBe('Pionnier permanent')
    expect(privilegeLabel('regular-pioneer', null)).toBe('Pionnier permanent')
    expect(privilegeLabel('elder', true)).toBe('Ancien')
  })
})

describe('formatListDate', () => {
  it('gives the day and short month, in the congregation zone', () => {
    // 23:30 UTC on 4 November is already the 5th in Paris.
    expect(formatListDate(new Date(Date.UTC(2026, 10, 4, 23, 30)), PARIS, NOW)).toBe('5 nov.')
  })

  it('adds the year when it is not this one', () => {
    expect(formatListDate(new Date(Date.UTC(2025, 11, 15, 18)), PARIS, NOW)).toBe('15 déc. 2025')
  })
})

describe('formatAbsence', () => {
  it('prints a range, or a single day', () => {
    expect(formatAbsence(new Date(Date.UTC(2026, 11, 14, 8)), new Date(Date.UTC(2026, 11, 21, 8)), PARIS, NOW)).toMatch(
      DECEMBER_RANGE,
    )
    expect(formatAbsence(new Date(Date.UTC(2026, 11, 14, 8)), null, PARIS, NOW)).toBe('14 déc.')
  })
})
