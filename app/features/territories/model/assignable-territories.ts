import type { Availability } from './territory-availability'

export const ASSIGNABLE_SORTS = ['last', 'number', 'proximity'] as const
export type AssignableSort = (typeof ASSIGNABLE_SORTS)[number]

export type AssignableView = 'free' | 'all'

interface Sortable {
  number: string
  last: { startDay: string; endDay: string | null } | null
  /** Its attributions worked this theocratic year. */
  yearCount: number
  distance: number | null
}

/** For when `a` or `b` is missing: the missing one first. */
function missingFirst(a: unknown, b: unknown): number {
  if (a == null) return b == null ? 0 : -1
  return 1
}

// The return day, not the day out: a territory kept out for months was worked until it came back. Never attributed
// first; one still out (paused for the campaign) last.
function byReturn(a: Sortable, b: Sortable): number {
  if (a.last == null || b.last == null) return missingFirst(a.last, b.last)
  const [aDay, bDay] = [a.last.endDay, b.last.endDay]
  if (aDay == null || bDay == null) return -missingFirst(aDay, bDay)
  return aDay.localeCompare(bDay)
}

function byDistance(a: Sortable, b: Sortable): number {
  if (a.distance == null || b.distance == null) return -missingFirst(a.distance, b.distance)
  return a.distance - b.distance
}

/**
 * The orders of « Attribuer un territoire »: the least worked first — the fewest times out this theocratic year, then
 * the longest since it came back (never attributed at the very top, one still out at the bottom) —, by number the way
 * people count (T2 before T10), or the nearest to a searched place, the unplaced last.
 */
export function sortAssignable<T extends Sortable>(rows: readonly T[], sort: AssignableSort, locale: string): T[] {
  const byNumber = (a: T, b: T) => a.number.localeCompare(b.number, locale, { numeric: true, sensitivity: 'base' })
  const compare: Record<AssignableSort, (a: T, b: T) => number> = {
    last: (a, b) => a.yearCount - b.yearCount || byReturn(a, b) || byNumber(a, b),
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
