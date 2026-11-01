import { afterEach, describe, expect, it } from 'vitest'
import { formatCalendarDay } from './calendar-day'

const ORIGINAL_TZ = process.env.TZ

afterEach(() => {
  // Assigning undefined would store the string "undefined".
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('formatCalendarDay', () => {
  it('writes the day out in the given locale', () => {
    expect(formatCalendarDay(new Date('2026-03-10T00:00:00Z'), 'fr')).toBe('10 mars 2026')
    expect(formatCalendarDay(new Date('2026-03-10T00:00:00Z'), 'en')).toBe('March 10, 2026')
  })

  // Read in the server's or the browser's timezone, UTC midnight on the 1st is the day before
  // anywhere west of Greenwich: New York would say 28 February.
  it('keeps the calendar day it was stored as, west of Greenwich', () => {
    process.env.TZ = 'America/New_York'
    expect(formatCalendarDay(new Date('2026-03-01T00:00:00Z'), 'fr')).toBe('1 mars 2026')
  })
})
