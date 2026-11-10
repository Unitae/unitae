import { type AttributionState, attributionState } from './attribution-list'
import type { TerritoryAttributionKind } from './territory-attribution-kind.type'
import { type Availability, territoryAvailability } from './territory-availability'

/** An attribution of a territory's history, as the standing rule reads it. Days are `YYYY-MM-DD`. */
interface Entry {
  type: TerritoryAttributionKind
  startDay: string
  endDay: string | null
  lateDay: string
  paused: boolean
  campaign: { id: number } | null
  restDays: number
  publisher: { leftDay: string | null; anonymized: boolean }
}

/**
 * Where a territory stands on `today`, from its history newest first: the attribution actively worked — before one a
 * campaign paused — with its state; the latest one rentré; whether it can go out.
 */
export function territoryStanding<T extends Entry>(
  history: readonly T[],
  { today, campaignMode }: { today: string; campaignMode: boolean },
): { current: (T & { state: AttributionState }) | null; last: T | null; availability: Availability } {
  const open = history.filter(entry => entry.endDay == null)
  const worked = open.find(entry => !entry.paused) ?? open[0] ?? null
  const last = history.find(entry => entry.endDay != null) ?? null
  const basis = worked ?? last
  return {
    current:
      worked == null
        ? null
        : {
            ...worked,
            state: attributionState({
              today,
              lateDay: worked.lateDay,
              paused: worked.paused,
              gone: worked.publisher.anonymized || worked.publisher.leftDay != null,
            }),
          },
    last,
    availability: territoryAvailability({
      last:
        basis == null
          ? null
          : {
              type: basis.type,
              campaignId: basis.campaign?.id ?? null,
              // The campaign's own rest, already worked out with the entry.
              campaignRestDays: basis.campaign != null ? basis.restDays : null,
              endDay: basis.endDay,
              paused: basis.paused,
            },
      today,
      campaignMode,
    }),
  }
}
