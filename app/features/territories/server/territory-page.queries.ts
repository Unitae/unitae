import type { AttributionListRow } from '~/features/territories/model/attribution-list'
import type { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { HolderEntranceSource } from '~/features/territories/model/holder-territory'
import { restDaysAfter } from '~/features/territories/model/resting-periods'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { formatLocalDate } from '~/shared/utils/date.server'

import { campaignOf, holderOf } from './attribution-list.queries'

/** One attribution of a territory's history, as days. */
export interface TerritoryHistoryEntry {
  id: number
  type: TerritoryAttributionKind
  startDay: string
  endDay: string | null
  lateDay: string
  paused: boolean
  pausedDay: string | null
  campaign: AttributionListRow['campaign']
  /** The campaign that paused it. */
  pausedBy: { name: string } | null
  /** How long the territory rests once this one is rentré. */
  restDays: number
  publisher: AttributionListRow['publisher']
  groupName: string | null
}

export interface TerritoryPage {
  territory: { id: number; number: string; type: TerritoryKindKey; notes: string }
  /** Its entrances as its holder reads them, with their kind and PMR access; `buildingOf` gives their building. */
  entrances: (HolderEntranceSource & { kind: EntranceKind; isPMR: boolean | null })[]
  buildingOf: Record<number, number>
  /** Newest first. */
  history: TerritoryHistoryEntry[]
}

/**
 * A territory of the congregation as its page shows it: its entrances, its notes, its attributions newest first. Null
 * when it is not one of the congregation's.
 */
export async function getTerritoryPage(
  db: TransactionClient,
  congregationId: number,
  territoryId: number,
): Promise<TerritoryPage | null> {
  const territory = await db.territory.findFirst({
    where: { id: territoryId, congregationId },
    select: {
      id: true,
      number: true,
      type: true,
      notes: true,
      entrances: {
        select: {
          id: true,
          homes: true,
          phones: true,
          access: true,
          isOpenEarly: true,
          isMailboxOpen: true,
          notes: true,
          shopKind: true,
          kind: true,
          isPMR: true,
          accesses: { orderBy: { position: 'asc' }, select: { type: true } },
          buildings: {
            where: { active: true },
            select: { id: true, number: true, street: true, zip: true, latitude: true, longitude: true },
          },
        },
      },
      attributions: {
        orderBy: [{ startDate: 'desc' }],
        select: {
          id: true,
          type: true,
          startDate: true,
          endDate: true,
          lateDate: true,
          pausedAt: true,
          campaign: { select: { id: true, name: true, endDate: true, restPeriodDays: true } },
          pausedByCampaign: { select: { name: true } },
          publisher: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              leftAt: true,
              anonymizedAt: true,
              publisherGroup: { select: { name: true } },
            },
          },
        },
      },
    },
  })
  if (territory == null) return null

  const buildingOf: Record<number, number> = {}
  for (const entrance of territory.entrances) {
    const first = entrance.buildings[0]
    if (first != null) buildingOf[entrance.id] = first.id
  }

  return {
    territory: {
      id: territory.id,
      number: territory.number,
      type: territory.type as TerritoryKindKey,
      notes: territory.notes,
    },
    entrances: territory.entrances as unknown as TerritoryPage['entrances'],
    buildingOf,
    history: territory.attributions.map(attribution => ({
      id: attribution.id,
      type: attribution.type as TerritoryAttributionKind,
      startDay: formatLocalDate(attribution.startDate),
      endDay: attribution.endDate != null ? formatLocalDate(attribution.endDate) : null,
      lateDay: formatLocalDate(attribution.lateDate),
      paused: attribution.pausedAt != null,
      pausedDay: attribution.pausedAt != null ? formatLocalDate(attribution.pausedAt) : null,
      campaign: campaignOf(attribution.campaign),
      pausedBy: attribution.pausedByCampaign ?? null,
      restDays: restDaysAfter({
        type: attribution.type,
        campaignId: attribution.campaign?.id ?? null,
        campaignRestDays: attribution.campaign?.restPeriodDays ?? null,
      }),
      publisher: holderOf(attribution.publisher),
      groupName:
        attribution.publisher.anonymizedAt != null ? null : (attribution.publisher.publisherGroup?.name ?? null),
    })),
  }
}

type Neighbour = { id: number; number: string } | null

/** The territories of the same kind just before and after it, in the order people count: T2 before T10. */
export async function findAdjacentTerritories(
  db: TransactionClient,
  congregationId: number,
  territory: { number: string; type: TerritoryKindKey | `${TerritoryKindKey}` },
  locale: string,
): Promise<{ prev: Neighbour; next: Neighbour }> {
  const all = await db.territory.findMany({
    where: { congregationId, type: territory.type as TerritoryKindKey },
    select: { id: true, number: true },
  })
  const sorted = all.sort((a, b) => a.number.localeCompare(b.number, locale, { numeric: true, sensitivity: 'base' }))
  const index = sorted.findIndex(t => t.number === territory.number)
  return { prev: sorted[index - 1] ?? null, next: index >= 0 ? (sorted[index + 1] ?? null) : null }
}
