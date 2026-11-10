import type { Availability } from './territory-availability'

export const ASSIGNABLE_SORTS = ['last', 'number', 'proximity'] as const
export type AssignableSort = (typeof ASSIGNABLE_SORTS)[number]

export type AssignableView = 'free' | 'all'

interface Sortable {
  number: string
  last: { startDay: string } | null
  distance: number | null
}

/**
 * The orders of « Attribuer un territoire »: the least recently attributed first (never attributed at the very top),
 * by number the way people count (T2 before T10), or the nearest to a searched place, the unplaced last.
 */
export function sortAssignable<T extends Sortable>(rows: readonly T[], sort: AssignableSort, locale: string): T[] {
  const byNumber = (a: T, b: T) => a.number.localeCompare(b.number, locale, { numeric: true, sensitivity: 'base' })
  const byLast = (a: T, b: T) => {
    if (a.last == null || b.last == null) return a.last == null ? (b.last == null ? 0 : -1) : 1
    return a.last.startDay.localeCompare(b.last.startDay)
  }
  const byDistance = (a: T, b: T) => {
    if (a.distance == null || b.distance == null) return a.distance == null ? (b.distance == null ? 0 : 1) : -1
    return a.distance - b.distance
  }
  const compare: Record<AssignableSort, (a: T, b: T) => number> = {
    last: (a, b) => byLast(a, b) || byNumber(a, b),
    number: byNumber,
    proximity: (a, b) => byDistance(a, b) || byNumber(a, b),
  }
  return [...rows].sort(compare[sort])
}

/** Whether a territory can go out today: free, or paused for the campaign running. */
export function isFreeToday(availability: Availability): boolean {
  return availability.kind === 'free' || availability.kind === 'paused'
}

export function assignableCounts(rows: readonly { availability: Availability }[]): Record<AssignableView, number> {
  return { free: rows.filter(row => isFreeToday(row.availability)).length, all: rows.length }
}

/** The order the address asks for; by proximity by default once a place was found. */
export function parseAssignableSort(params: URLSearchParams, near: boolean): AssignableSort {
  const sort = params.get('sort')
  if (sort === 'last' || sort === 'number' || (sort === 'proximity' && near)) return sort
  return near ? 'proximity' : 'last'
}
