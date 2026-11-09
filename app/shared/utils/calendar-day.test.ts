import { describe, expect, it } from 'vitest'

import { addDays, dayOf, daysBetween, endOfDay, mondayOf, startOfDay } from './calendar-day'

const PARIS = 'Europe/Paris'

describe('days in a time zone', () => {
  it('starts a Paris day at its midnight, an hour before UTC in winter', () => {
    expect(startOfDay('2026-11-10', PARIS).toISOString()).toBe('2026-11-09T23:00:00.000Z')
  })

  it('ends a Paris day on its very last instant, summer time included', () => {
    expect(endOfDay('2026-07-14', PARIS).toISOString()).toBe('2026-07-14T21:59:59.999Z')
  })

  it('reads the day an instant falls on in the zone, not in UTC', () => {
    expect(dayOf(new Date('2026-11-09T23:30:00Z'), PARIS)).toBe('2026-11-10')
  })
})

describe('calendar arithmetic', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('counts days across the change to winter time', () => {
    expect(daysBetween('2026-10-24', '2026-10-27')).toBe(3)
  })

  it('finds the Monday of a week, a Sunday belonging to the week before', () => {
    expect(mondayOf('2026-11-11')).toBe('2026-11-09')
    expect(mondayOf('2026-11-15')).toBe('2026-11-09')
    expect(mondayOf('2026-11-09')).toBe('2026-11-09')
  })
})
