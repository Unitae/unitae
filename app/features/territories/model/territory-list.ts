import { isFreeToday } from './assignable-territories'
import type { AttributionState } from './attribution-list'
import type { Availability } from './territory-availability'

export const TERRITORY_VIEWS = ['all', 'free', 'out', 'late'] as const
export type TerritoryView = (typeof TERRITORY_VIEWS)[number]

export type TerritorySort = 'number' | 'last' | 'proximity'

interface Viewable {
  holder: { state: AttributionState } | null
  availability: Availability
}

/**
 * Out: someone holds it. Late: its holder is past the due day. Free: it can go out today — nobody holds it, or a
 * campaign paused its attribution — as « Disponibles » counts it on « Attribuer un territoire ».
 */
export function inTerritoryView(row: Viewable, view: TerritoryView): boolean {
  if (view === 'out') return row.holder != null
  if (view === 'late') return row.holder?.state === 'overdue'
  if (view === 'free') return isFreeToday(row.availability)
  return true
}

export function territoryViewCounts(rows: readonly Viewable[]): Record<TerritoryView, number> {
  const count = (view: TerritoryView) => rows.filter(row => inTerritoryView(row, view)).length
  return { all: rows.length, free: count('free'), out: count('out'), late: count('late') }
}

export function parseTerritoryView(params: URLSearchParams): TerritoryView {
  const view = params.get('view')
  return (TERRITORY_VIEWS as readonly string[]).includes(view ?? '') ? (view as TerritoryView) : 'all'
}

interface Sortable {
  number: string
  lastDay: string | null
  distance: number | null
}

/** By number the way people count (T2 before T10), the least recently attributed first, or the nearest first. */
export function sortTerritories<T extends Sortable>(rows: readonly T[], sort: TerritorySort, locale: string): T[] {
  const byNumber = (a: T, b: T) => a.number.localeCompare(b.number, locale, { numeric: true, sensitivity: 'base' })
  const byLast = (a: T, b: T) => {
    if (a.lastDay == null || b.lastDay == null) return a.lastDay == null ? (b.lastDay == null ? 0 : -1) : 1
    return a.lastDay.localeCompare(b.lastDay)
  }
  const byDistance = (a: T, b: T) => {
    if (a.distance == null || b.distance == null) return a.distance == null ? (b.distance == null ? 0 : 1) : -1
    return a.distance - b.distance
  }
  const compare: Record<TerritorySort, (a: T, b: T) => number> = {
    number: byNumber,
    last: (a, b) => byLast(a, b) || byNumber(a, b),
    proximity: (a, b) => byDistance(a, b) || byNumber(a, b),
  }
  return [...rows].sort(compare[sort])
}

export function parseTerritorySort(params: URLSearchParams, near: boolean): TerritorySort {
  const sort = params.get('sort')
  if (sort === 'number' || sort === 'last' || (sort === 'proximity' && near)) return sort
  return near ? 'proximity' : 'number'
}
