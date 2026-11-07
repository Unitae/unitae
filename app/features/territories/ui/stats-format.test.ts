import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/runtime', () => ({
  getLocale: vi.fn(() => 'fr'),
}))
vi.mock('~/i18n/paraglide/messages', () => ({
  stats_view_chart: () => 'Graphique',
  stats_view_table: () => 'Tableau',
  stats_view_group: () => 'Affichage',
}))

const { currentMonthKey, formatDelta, formatPercent, statsViewLabels } = await import('./stats-format')

// Intl may print an ASCII hyphen or a true minus sign depending on the ICU build.
const MINUS_FIVE = /^[-−]5$/

describe('formatPercent', () => {
  it('uses the French decimal comma and keeps the sign on the same line', () => {
    expect(formatPercent(87.42)).toBe('87,4 %')
  })

  it('drops a trailing zero rather than printing « 100,0 »', () => {
    expect(formatPercent(100)).toBe('100 %')
  })
})

describe('formatDelta', () => {
  it('signs gains and losses, and leaves zero unsigned', () => {
    expect(formatDelta(6.25)).toBe('+6,3')
    expect(formatDelta(-5)).toMatch(MINUS_FIVE)
    expect(formatDelta(0)).toBe('0')
  })
})

describe('currentMonthKey', () => {
  it('formats the month as YYYY-MM with a leading zero', () => {
    expect(currentMonthKey(new Date(2026, 2, 15))).toBe('2026-03')
  })
})

describe('statsViewLabels', () => {
  it('provides the three labels the Chart / Table switch needs', () => {
    expect(statsViewLabels()).toEqual({ chart: 'Graphique', table: 'Tableau', group: 'Affichage' })
  })
})
