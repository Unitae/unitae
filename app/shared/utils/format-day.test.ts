import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/runtime', () => ({ getLocale: () => 'fr' }))

const { formatDay, shortDay } = await import('./format-day')

// A calendar day (`YYYY-MM-DD`) reads the same for everyone, whatever their zone.

describe('formatDay', () => {
  it('formats the day itself, never the one before or after', () => {
    expect(formatDay('2026-11-29', { weekday: 'short', day: 'numeric', month: 'short' })).toBe('dim. 29 nov.')
    expect(formatDay('2026-01-01', { day: 'numeric', month: 'long' })).toBe('1 janvier')
  })
})

describe('shortDay', () => {
  it('leaves the year out in the year of today, and says it otherwise', () => {
    expect(shortDay('2026-08-25', '2026-11-10')).toBe('25 août')
    expect(shortDay('2027-01-09', '2026-11-10')).toBe('9 janv. 2027')
  })
})
