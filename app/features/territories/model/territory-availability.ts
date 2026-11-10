import { addDays } from '~/shared/utils/calendar-day'

import { restDaysAfter } from './resting-periods'
import type { TerritoryAttributionKind } from './territory-attribution-kind.type'

/** The latest attribution of a territory, as the availability rule reads it. */
export interface LastAttribution {
  type: TerritoryAttributionKind | `${TerritoryAttributionKind}`
  campaignId: number | null
  /** The campaign's own rest, when it set one. */
  campaignRestDays: number | null
  /** null while it is open. */
  endDay: string | null
  paused: boolean
}

export type Availability =
  | { kind: 'free' }
  | { kind: 'held' }
  | { kind: 'paused' }
  /** Resting after its last attribution: free again on `freeDay`. */
  | { kind: 'resting'; freeDay: string }

/**
 * Whether a territory can be attributed on `today`. An open attribution holds it, unless a campaign paused it: then it
 * is free for the campaign. Once rentré it rests — 90 days after door-to-door work, 15 after phone work, the campaign's
 * own rest after campaign work. During a campaign the regular rest does not apply: a campaign is a different kind of
 * visit, and only recent campaign work keeps its rest.
 */
export function territoryAvailability({
  last,
  today,
  campaignMode,
}: {
  last: LastAttribution | null
  today: string
  campaignMode: boolean
}): Availability {
  if (last == null) return { kind: 'free' }
  if (last.endDay == null) return last.paused ? { kind: 'paused' } : { kind: 'held' }
  if (campaignMode && last.campaignId == null) return { kind: 'free' }

  const freeDay = addDays(last.endDay, restDaysAfter(last))
  return today >= freeDay ? { kind: 'free' } : { kind: 'resting', freeDay }
}
