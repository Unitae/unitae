import { daysBetween } from '~/shared/utils/calendar-day'

import type { TerritoryAttributionKind } from './territory-attribution-kind.type'
import type { TerritoryKindKey } from './territory-kind.type'

/** Where an open attribution stands: without a holder, paused by a campaign, or how close its due day is. */
export type AttributionState = 'orphaned' | 'paused' | 'overdue' | 'due-soon' | 'on-time'

/** Within two weeks of its due day a loan is due soon, as on « Mes territoires ». */
export const DUE_SOON_DAYS = 14

/**
 * An open attribution's state on `today`. A missing holder comes first: fixing it is more urgent than any date. A
 * paused one has no due day to miss, its clock is frozen. Otherwise it is overdue from its due day on, the moment the
 * holder's own page says so too.
 */
export function attributionState({
  today,
  lateDay,
  paused,
  gone,
}: {
  today: string
  lateDay: string
  paused: boolean
  gone: boolean
}): AttributionState {
  if (gone) return 'orphaned'
  if (paused) return 'paused'
  const left = daysBetween(today, lateDay)
  if (left <= 0) return 'overdue'
  if (left <= DUE_SOON_DAYS) return 'due-soon'
  return 'on-time'
}

/** One open attribution as the managers' list shows it. Days are `YYYY-MM-DD`. */
export interface AttributionListRow {
  id: number
  type: TerritoryAttributionKind
  startDay: string
  lateDay: string
  state: AttributionState
  territory: { id: number; number: string; type: TerritoryKindKey }
  /** An anonymised publisher keeps no name: `firstname` and `lastname` come back null. */
  publisher: {
    id: number
    firstname: string | null
    lastname: string | null
    leftDay: string | null
    anonymized: boolean
  }
  /** The campaign the attribution belongs to, due back when it ends. */
  campaign: { id: number; name: string; endDay: string } | null
  /** The campaign that paused it. */
  pausedBy: { name: string } | null
  /** How long the territory rests once rentré. */
  restDays: number
  /** Metres from the searched place; null when nothing of the territory is placed, or no place was searched. */
  distance: number | null
}

export const ATTRIBUTION_VIEWS = ['all', 'late', 'paused', 'orphaned'] as const
export type AttributionView = (typeof ATTRIBUTION_VIEWS)[number]

const VIEW_OF_STATE: Partial<Record<AttributionState, AttributionView>> = {
  overdue: 'late',
  paused: 'paused',
  orphaned: 'orphaned',
}

/** Whether an attribution in `state` shows in `view`. */
export function inAttributionView(state: AttributionState, view: AttributionView): boolean {
  return view === 'all' || VIEW_OF_STATE[state] === view
}

export function viewCounts(states: readonly AttributionState[]): Record<AttributionView, number> {
  const counts: Record<AttributionView, number> = { all: states.length, late: 0, paused: 0, orphaned: 0 }
  for (const state of states) {
    const view = VIEW_OF_STATE[state]
    if (view != null) counts[view] += 1
  }
  return counts
}

/** The view the address asks for. The old filters (`?status=`, `?paused=true`) still land on their view. */
export function parseAttributionView(params: URLSearchParams): AttributionView {
  const view = params.get('view')
  if (view != null && (ATTRIBUTION_VIEWS as readonly string[]).includes(view)) return view as AttributionView
  const status = params.get('status')
  if (status === 'late') return 'late'
  if (status === 'orphaned') return 'orphaned'
  if (params.get('paused') === 'true') return 'paused'
  return 'all'
}

export const ATTRIBUTION_SORTS = ['date', 'number', 'proximity'] as const
export type AttributionSort = (typeof ATTRIBUTION_SORTS)[number]

interface Sortable {
  territory: { number: string }
  startDay: string
  distance?: number | null
}

/**
 * The orders of the list: the longest out first, by number the way people count (T2 before T10), or the nearest to a
 * searched address first, the territories without a known place last.
 */
export function sortAttributions<T extends Sortable>(rows: readonly T[], sort: AttributionSort, locale: string): T[] {
  const byNumber = (a: T, b: T) =>
    a.territory.number.localeCompare(b.territory.number, locale, { numeric: true, sensitivity: 'base' })
  const compare: Record<AttributionSort, (a: T, b: T) => number> = {
    date: (a, b) => a.startDay.localeCompare(b.startDay) || byNumber(a, b),
    number: byNumber,
    proximity: (a, b) => distanceOrder(a.distance, b.distance) || byNumber(a, b),
  }
  return [...rows].sort(compare[sort])
}

function distanceOrder(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a - b
}
