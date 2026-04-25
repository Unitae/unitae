import { describe, expect, it } from 'vitest'
import {
  type ConflictingEvent,
  computeDurationDays,
  getConflictsForWeek,
  getMonday,
  groupEventsByWeek,
} from './days-off-helpers'

// Helper to get the ISO key for a Monday, matching how groupEventsByWeek generates keys
function mondayKey(year: number, month: number, day: number): string {
  const d = new Date(year, month, day, 0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

describe('getMonday', () => {
  it('returns the same day for a Monday', () => {
    const monday = new Date(2025, 3, 7) // Monday 7 April 2025
    const result = getMonday(monday)
    expect(result.getFullYear()).toBe(2025)
    expect(result.getMonth()).toBe(3)
    expect(result.getDate()).toBe(7)
  })

  it('returns the previous Monday for a Wednesday', () => {
    const wednesday = new Date(2025, 3, 9) // Wednesday 9 April 2025
    const result = getMonday(wednesday)
    expect(result.getDate()).toBe(7)
  })

  it('returns the previous Monday for a Sunday', () => {
    const sunday = new Date(2025, 3, 13) // Sunday 13 April 2025
    const result = getMonday(sunday)
    expect(result.getDate()).toBe(7)
  })

  it('returns the previous Monday for a Saturday', () => {
    const saturday = new Date(2025, 3, 12) // Saturday 12 April 2025
    const result = getMonday(saturday)
    expect(result.getDate()).toBe(7)
  })
})

describe('groupEventsByWeek', () => {
  it('groups a single-week event into one week', () => {
    const events = [{ startDate: new Date(2025, 3, 8), endDate: new Date(2025, 3, 10) }]
    const groups = groupEventsByWeek(events)

    expect(groups.size).toBe(1)
    const key = mondayKey(2025, 3, 7)
    expect(groups.get(key)).toHaveLength(1)
  })

  it('places a multi-week event in every overlapping week', () => {
    // Tuesday 8 April → Thursday 17 April = spans 2 weeks
    const events = [{ startDate: new Date(2025, 3, 8), endDate: new Date(2025, 3, 17) }]
    const groups = groupEventsByWeek(events)

    expect(groups.size).toBe(2)
    expect(groups.get(mondayKey(2025, 3, 7))).toHaveLength(1)
    expect(groups.get(mondayKey(2025, 3, 14))).toHaveLength(1)
  })

  it('places a 3-week event in all 3 weeks', () => {
    // Monday 7 April → Friday 25 April = spans 3 weeks
    const events = [{ startDate: new Date(2025, 3, 7), endDate: new Date(2025, 3, 25) }]
    const groups = groupEventsByWeek(events)

    expect(groups.size).toBe(3)
    expect(groups.has(mondayKey(2025, 3, 7))).toBe(true)
    expect(groups.has(mondayKey(2025, 3, 14))).toBe(true)
    expect(groups.has(mondayKey(2025, 3, 21))).toBe(true)
  })

  it('groups multiple events into the same week', () => {
    const events = [
      { startDate: new Date(2025, 3, 8), endDate: new Date(2025, 3, 9) },
      { startDate: new Date(2025, 3, 10), endDate: new Date(2025, 3, 11) },
    ]
    const groups = groupEventsByWeek(events)

    expect(groups.size).toBe(1)
    expect(groups.get(mondayKey(2025, 3, 7))).toHaveLength(2)
  })

  it('returns an empty map for no events', () => {
    const groups = groupEventsByWeek([])
    expect(groups.size).toBe(0)
  })

  it('preserves insertion order (sorted by start date)', () => {
    const events = [
      { startDate: new Date(2025, 3, 8), endDate: new Date(2025, 3, 9) },
      { startDate: new Date(2025, 3, 15), endDate: new Date(2025, 3, 16) },
    ]
    const groups = groupEventsByWeek(events)
    const keys = [...groups.keys()]

    expect(keys).toEqual([mondayKey(2025, 3, 7), mondayKey(2025, 3, 14)])
  })
})

describe('computeDurationDays', () => {
  it('returns 0 for same-day events', () => {
    const date = new Date(2025, 3, 8)
    expect(computeDurationDays(date, date)).toBe(0)
  })

  it('returns 1 for a one-day span', () => {
    expect(computeDurationDays(new Date(2025, 3, 8), new Date(2025, 3, 9))).toBe(1)
  })

  it('returns 7 for a one-week span', () => {
    expect(computeDurationDays(new Date(2025, 3, 7), new Date(2025, 3, 14))).toBe(7)
  })

  it('returns 14 for a two-week span', () => {
    expect(computeDurationDays(new Date(2025, 3, 7), new Date(2025, 3, 21))).toBe(14)
  })
})

describe('getConflictsForWeek', () => {
  const conflicts: ConflictingEvent[] = [
    { eventId: 1, eventName: 'Reunion 1', eventDate: new Date(2025, 3, 8).toISOString() },
    { eventId: 2, eventName: 'Reunion 2', eventDate: new Date(2025, 3, 15).toISOString() },
    { eventId: 3, eventName: 'Reunion 3', eventDate: new Date(2025, 3, 22).toISOString() },
  ]

  it('returns only conflicts within the given week', () => {
    const result = getConflictsForWeek(conflicts, mondayKey(2025, 3, 7))
    expect(result).toHaveLength(1)
    expect(result[0].eventId).toBe(1)
  })

  it('returns conflicts for a different week', () => {
    const result = getConflictsForWeek(conflicts, mondayKey(2025, 3, 14))
    expect(result).toHaveLength(1)
    expect(result[0].eventId).toBe(2)
  })

  it('returns empty array when no conflicts match the week', () => {
    const result = getConflictsForWeek(conflicts, mondayKey(2025, 3, 28))
    expect(result).toHaveLength(0)
  })

  it('returns empty array for empty conflicts list', () => {
    const result = getConflictsForWeek([], mondayKey(2025, 3, 7))
    expect(result).toHaveLength(0)
  })

  it('includes conflicts on Monday but excludes next Monday', () => {
    const mondayConflicts: ConflictingEvent[] = [
      { eventId: 10, eventName: 'Monday event', eventDate: new Date(2025, 3, 7).toISOString() },
      { eventId: 11, eventName: 'Next Monday', eventDate: new Date(2025, 3, 14).toISOString() },
    ]
    const result = getConflictsForWeek(mondayConflicts, mondayKey(2025, 3, 7))
    expect(result).toHaveLength(1)
    expect(result[0].eventId).toBe(10)
  })
})
