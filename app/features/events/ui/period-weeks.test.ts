import { describe, expect, it } from 'vitest'

import { conflictsInWeek, matchesName, periodWeeks, weekOf } from './period-weeks'

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

describe('periodWeeks', () => {
  const ids = (weeks: ReturnType<typeof periodWeeks<ReturnType<typeof absence>>>) =>
    weeks.map(week => [week.monday, week.items.map(row => (row.continued ? `${row.item.id}+` : row.item.id))])

  it('lists every week of the period, the ones nobody is away included', () => {
    const weeks = periodWeeks(
      [absence(1, '2026-11-09T23:00:00Z', '2026-11-10T22:59:59.999Z')],
      { from: '2026-11-11', to: '2026-11-29' },
      PARIS,
    )

    expect(ids(weeks)).toEqual([
      ['2026-11-09', [1]],
      ['2026-11-16', []],
      ['2026-11-23', []],
    ])
  })

  it('puts an absence starting on a Monday in that week, not the one before', () => {
    const weeks = periodWeeks(
      [absence(1, '2026-11-08T23:00:00Z', '2026-11-13T22:59:59.999Z')],
      { from: '2026-11-02', to: '2026-11-15' },
      PARIS,
    )

    expect(ids(weeks)).toEqual([
      ['2026-11-02', []],
      ['2026-11-09', [1]],
    ])
  })

  it('places an absence in every week it touches, marked as continued after its first', () => {
    const weeks = periodWeeks(
      [absence(1, '2026-12-20T23:00:00Z', '2027-01-03T22:59:59.999Z')],
      { from: '2026-12-21', to: '2027-01-03' },
      PARIS,
    )

    expect(ids(weeks)).toEqual([
      ['2026-12-21', [1]],
      ['2026-12-28', ['1+']],
    ])
  })

  it('marks as continued an absence that began before the period', () => {
    const weeks = periodWeeks(
      [absence(1, '2026-11-06T23:00:00Z', '2026-11-18T22:59:59.999Z')],
      { from: '2026-11-09', to: '2026-11-15' },
      PARIS,
    )

    expect(ids(weeks)).toEqual([['2026-11-09', ['1+']]])
  })

  it('keeps the order of the absences within a week', () => {
    const weeks = periodWeeks(
      [
        absence(2, '2026-11-09T23:00:00Z', '2026-11-10T22:59:59.999Z'),
        absence(1, '2026-11-11T23:00:00Z', '2026-11-12T22:59:59.999Z'),
      ],
      { from: '2026-11-09', to: '2026-11-15' },
      PARIS,
    )

    expect(ids(weeks)).toEqual([['2026-11-09', [2, 1]]])
  })
})

describe('conflictsInWeek', () => {
  const conflicts = [
    { id: 1, eventDate: '2026-11-12T18:00:00Z' },
    { id: 2, eventDate: '2026-11-15T09:00:00Z' },
    { id: 3, eventDate: '2026-11-19T18:00:00Z' },
  ]

  it('keeps the assignments falling in the week, its Sunday included', () => {
    expect(conflictsInWeek(conflicts, '2026-11-09', PARIS).map(c => c.id)).toEqual([1, 2])
    expect(conflictsInWeek(conflicts, '2026-11-16', PARIS).map(c => c.id)).toEqual([3])
  })
})

describe('matchesName', () => {
  it('finds a name from any part of it, whatever its case and accents', () => {
    expect(matchesName('Élodie MARTIN', 'elodie')).toBe(true)
    expect(matchesName('Élodie MARTIN', 'mart')).toBe(true)
    expect(matchesName('Élodie MARTIN', '  ')).toBe(true)
    expect(matchesName('Élodie MARTIN', 'roux')).toBe(false)
  })
})
