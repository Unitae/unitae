import { describe, expect, it } from 'vitest'

import { assignableCounts, parseAssignableSort, sortAssignable } from './assignable-territories'

// « Attribuer un territoire »: the least worked first — the fewest times out this theocratic year, then the longest
// since it came back, those never attributed at the very top; by number the way people count; or the nearest to a
// searched place.

const row = (number: string, endDay: string | null, distance: number | null = null, kind = 'free', yearCount = 0) => ({
  number,
  last: endDay == null ? null : { startDay: '2025-01-01', endDay },
  yearCount,
  distance,
  availability: { kind } as { kind: 'free' } | { kind: 'resting'; freeDay: string },
})
const numbers = (rows: { number: string }[]) => rows.map(r => r.number)

describe('sortAssignable', () => {
  it('puts the never attributed first, then the longest since it came back, by number on a tie', () => {
    const rows = [row('T12', '2025-12-21'), row('T15', null), row('T07', '2025-11-03'), row('T2', '2025-12-21')]
    expect(numbers(sortAssignable(rows, 'last', 'fr'))).toEqual(['T15', 'T07', 'T2', 'T12'])
  })

  it('orders by the times out this year before the day it came back', () => {
    const rows = [
      row('T1', '2025-03-01', null, 'free', 2),
      row('T2', '2026-10-01', null, 'free', 0),
      row('T3', '2026-09-15', null, 'free', 1),
    ]
    expect(numbers(sortAssignable(rows, 'last', 'fr'))).toEqual(['T2', 'T3', 'T1'])
  })

  it('reads the return day, not the day out: kept out long means worked recently', () => {
    const longLoan = { ...row('C02', null), last: { startDay: '2026-01-30', endDay: '2026-06-30' } }
    const shortLoan = { ...row('P01', null), last: { startDay: '2026-02-13', endDay: '2026-04-13' } }
    expect(numbers(sortAssignable([longLoan, shortLoan], 'last', 'fr'))).toEqual(['P01', 'C02'])
  })

  it('puts one still out (paused for the campaign) after those that came back, at the same count', () => {
    const out = { ...row('T9', null, null, 'paused', 1), last: { startDay: '2026-09-02', endDay: null } }
    const back = row('T4', '2026-10-20', null, 'free', 1)
    expect(numbers(sortAssignable([out, back], 'last', 'fr'))).toEqual(['T4', 'T9'])
  })

  it('sorts by number the way people count, or by distance with the unplaced last', () => {
    const rows = [row('T10', null, 50), row('T2', null, null), row('T1', null, 900)]
    expect(numbers(sortAssignable(rows, 'number', 'fr'))).toEqual(['T1', 'T2', 'T10'])
    expect(numbers(sortAssignable(rows, 'proximity', 'fr'))).toEqual(['T10', 'T1', 'T2'])
  })
})

describe('assignableCounts', () => {
  it('counts the territories free today, paused ones included, and all of them', () => {
    const rows = [row('T1', null), row('T2', null, null, 'resting'), row('T3', null, null, 'paused')]
    expect(assignableCounts(rows)).toEqual({ free: 2, all: 3 })
  })
})

describe('parseAssignableSort', () => {
  it('reads the order of the address; by proximity only when a place was found', () => {
    expect(parseAssignableSort(new URLSearchParams('sort=number'), false)).toBe('number')
    expect(parseAssignableSort(new URLSearchParams('sort=proximity'), false)).toBe('last')
    expect(parseAssignableSort(new URLSearchParams(''), true)).toBe('proximity')
    expect(parseAssignableSort(new URLSearchParams(''), false)).toBe('last')
  })
})
