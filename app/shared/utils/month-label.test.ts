import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/runtime', () => ({
  getLocale: vi.fn(() => 'fr'),
}))

const { formatMonthLabel } = await import('./month-label')
const { getLocale } = await import('~/i18n/paraglide/runtime')

describe('formatMonthLabel', () => {
  it('returns the short month name in the active locale (fr)', () => {
    vi.mocked(getLocale).mockReturnValue('fr')
    // French short month abbreviations include a trailing period (e.g. "sept.").
    expect(formatMonthLabel('2025-09').toLowerCase()).toContain('sept')
  })

  it('returns the short month name in English when locale switches', () => {
    vi.mocked(getLocale).mockReturnValue('en')
    expect(formatMonthLabel('2025-09')).toBe('Sep')
    expect(formatMonthLabel('2025-12')).toBe('Dec')
  })

  it('handles October without DST-driven month shift', () => {
    vi.mocked(getLocale).mockReturnValue('en')
    expect(formatMonthLabel('2025-10')).toBe('Oct')
  })

  it('handles January correctly (zero-indexed month math)', () => {
    vi.mocked(getLocale).mockReturnValue('en')
    expect(formatMonthLabel('2025-01')).toBe('Jan')
  })
})
