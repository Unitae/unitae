import { describe, expect, it } from 'vitest'

import { assignableCounts, parseAssignableSort, sortAssignable } from './assignable-territories'

// « Attribuer un territoire »: the least recently attributed first, those never attributed at the very top; by number
// the way people count; or the nearest to a searched place.

const row = (number: string, startDay: string | null, distance: number | null = null, kind = 'free') => ({
  number,
  last: startDay == null ? null : { startDay },
  distance,
  availability: { kind } as { kind: 'free' } | { kind: 'resting'; freeDay: string },
})
const numbers = (rows: { number: string }[]) => rows.map(r => r.number)

describe('sortAssignable', () => {
  it('puts the never attributed first, then the least recently attributed', () => {
    const rows = [row('T12', '2025-12-21'), row('T15', null), row('T07', '2025-11-03'), row('T2', '2025-12-21')]
    expect(numbers(sortAssignable(rows, 'last', 'fr'))).toEqual(['T15', 'T07', 'T2', 'T12'])
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
