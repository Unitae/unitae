import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/runtime', () => ({
  getLocale: vi.fn(() => 'fr'),
}))

const { dateChip, elapsedPercent, formatDelta, formatMeetingWhen, formatShare, formatShortDate, formatTodayLabel } =
  await import('./dashboard-format')

// Instants are built in UTC and read in the congregation's zone, so the runner's own zone never
// leaks into the result.
const PARIS = 'Europe/Paris'

describe('formatTodayLabel', () => {
  it('names the day and month, capitalised, without the year', () => {
    expect(formatTodayLabel(new Date(Date.UTC(2026, 10, 7, 10)), PARIS)).toBe('Samedi 7 novembre')
  })

  it('reads the day in the congregation zone, not the server one', () => {
    // 23:30 UTC on the 6th is already the 7th in Paris.
    expect(formatTodayLabel(new Date(Date.UTC(2026, 10, 6, 23, 30)), PARIS)).toBe('Samedi 7 novembre')
  })
})

describe('formatMeetingWhen', () => {
  it('gives the short day and the local start time', () => {
    expect(formatMeetingWhen(new Date(Date.UTC(2026, 10, 12, 18, 0)), PARIS)).toBe('jeu. 12 nov. · 19:00')
  })
})

describe('formatShortDate', () => {
  it('keeps the year for absence ranges', () => {
    expect(formatShortDate(new Date(Date.UTC(2026, 11, 24, 10)), PARIS)).toBe('24 déc. 2026')
  })
})

describe('dateChip', () => {
  it('splits the weekday from the day of the month', () => {
    expect(dateChip(new Date(Date.UTC(2026, 10, 12, 18)), PARIS)).toEqual({ weekday: 'jeu.', day: '12' })
  })
})

describe('formatShare', () => {
  it('rounds to a whole percent with French spacing', () => {
    expect(formatShare(34, 52)).toBe('65 %')
  })

  it('reads zero when there is no whole', () => {
    expect(formatShare(0, 0)).toBe('0 %')
  })
})

describe('formatDelta', () => {
  it('signs a rise with a plus and a fall with a true minus sign', () => {
    expect(formatDelta(3)).toBe('+3')
    expect(formatDelta(-2)).toBe('\u22122')
  })

  it('groups thousands the local way', () => {
    expect(formatDelta(1200)).toBe('+1\u202f200')
  })
})

describe('elapsedPercent', () => {
  const start = new Date(2026, 0, 1)
  const due = new Date(2026, 0, 11)

  it('measures how much of the loan period has passed', () => {
    expect(elapsedPercent(start, due, new Date(2026, 0, 6))).toBe(50)
  })

  it('stays within 0 and 100', () => {
    expect(elapsedPercent(start, due, new Date(2025, 11, 1))).toBe(0)
    expect(elapsedPercent(start, due, new Date(2026, 2, 1))).toBe(100)
  })

  it('reads as complete when the due date is not after the start', () => {
    expect(elapsedPercent(start, start, new Date(2026, 0, 1))).toBe(100)
  })
})
