import { describe, expect, it } from 'vitest'

import { getConflictsForWeek, groupEventsByWeek, weekOf } from './days-off-helpers'

const PARIS = 'Europe/Paris'

// An absence by day in Paris: from the first day's midnight to the last day's very end.
const absence = (id: number, startDate: string, endDate: string) => ({ id, startDate, endDate })

describe('weekOf', () => {
  it('gives the Monday of the week, a Sunday belonging to the week before', () => {
    expect(weekOf('2026-11-11T10:00:00Z', PARIS)).toBe('2026-11-09')
    expect(weekOf('2026-11-15T10:00:00Z', PARIS)).toBe('2026-11-09')
  })

  it('reads the day in the congregation zone, not in UTC', () => {
    // 23:00 UTC on Sunday the 8th is already Monday the 9th in Paris.
    expect(weekOf('2026-11-08T23:00:00Z', PARIS)).toBe('2026-11-09')
  })
})

describe('groupEventsByWeek', () => {
  it('puts an absence starting on a Monday in that week, not the one before', () => {
    const groups = groupEventsByWeek([absence(1, '2026-11-08T23:00:00Z', '2026-11-13T22:59:59.999Z')], PARIS)

    expect([...groups.keys()]).toEqual(['2026-11-09'])
  })

  it('places an absence in every week it touches', () => {
    const groups = groupEventsByWeek([absence(1, '2026-12-20T23:00:00Z', '2027-01-03T22:59:59.999Z')], PARIS)

    expect([...groups.keys()]).toEqual(['2026-12-21', '2026-12-28'])
  })

  it('keeps the weeks in the order of the absences', () => {
    const groups = groupEventsByWeek(
      [
        absence(1, '2026-11-09T23:00:00Z', '2026-11-10T22:59:59.999Z'),
        absence(2, '2026-11-16T23:00:00Z', '2026-11-17T22:59:59.999Z'),
      ],
      PARIS,
    )

    expect([...groups.entries()].map(([week, events]) => [week, events.map(e => e.id)])).toEqual([
      ['2026-11-09', [1]],
      ['2026-11-16', [2]],
    ])
  })

  it('returns nothing for no absence', () => {
    expect(groupEventsByWeek([], PARIS).size).toBe(0)
  })
})

describe('getConflictsForWeek', () => {
  const conflicts = [
    { eventId: 1, eventName: 'Réunion de semaine', eventDate: '2026-11-12T18:00:00Z' },
    { eventId: 2, eventName: 'Réunion de week-end', eventDate: '2026-11-15T09:00:00Z' },
    { eventId: 3, eventName: 'Réunion de semaine', eventDate: '2026-11-19T18:00:00Z' },
  ]

  it('keeps the conflicts of the week, Sunday included', () => {
    expect(getConflictsForWeek(conflicts, '2026-11-09', PARIS).map(c => c.eventId)).toEqual([1, 2])
  })

  it('leaves out the following Monday onwards', () => {
    expect(getConflictsForWeek(conflicts, '2026-11-16', PARIS).map(c => c.eventId)).toEqual([3])
  })
})
