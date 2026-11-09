import type { Prisma } from '~/database/generated/client'
import { type AttributionListRow, attributionState } from '~/features/territories/model/attribution-list'
import type { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { getTerritoryPmrStatus, type PmrStatus } from '~/features/territories/model/pmr-status'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { type Availability, territoryAvailability } from '~/features/territories/model/territory-availability'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { formatLocalDate } from '~/shared/utils/date.server'
import type { LatLng } from '~/shared/utils/distance'

import { campaignOf, distanceOf, holderOf } from './attribution-list.queries'

/** Who holds a territory and when it comes back, as its row says it. */
export interface TerritoryHolder {
  attributionId: number
  state: AttributionListRow['state']
  lateDay: string
  publisher: AttributionListRow['publisher']
  campaign: AttributionListRow['campaign']
  pausedBy: { name: string } | null
}

export interface TerritoryListRow {
  id: number
  number: string
  type: TerritoryKindKey
  quantity: { homes: number; phones: number; entrances: number }
  pmr: PmrStatus | null
  /** It was attributed at least once: it cannot be deleted, its history counts for the S-13. */
  hasHistory: boolean
  holder: TerritoryHolder | null
  /** Whether it can go out today; `held` while someone holds it. */
  availability: Availability
  /** The day its latest attribution started; null when it was never attributed. */
  lastDay: string | null
  distance: number | null
}

const attributionSelect = {
  id: true,
  type: true,
  campaignId: true,
  startDate: true,
  endDate: true,
  lateDate: true,
  pausedAt: true,
  campaign: { select: { id: true, name: true, endDate: true, restPeriodDays: true } },
  pausedByCampaign: { select: { name: true } },
  publisher: { select: { id: true, firstname: true, lastname: true, leftAt: true, anonymizedAt: true } },
} as const

type Loaded = Prisma.AttributionGetPayload<{ select: typeof attributionSelect }>

/**
 * The congregation's territories matching `where`, each with who holds it on `today` (the attribution actively worked
 * before one a campaign paused) or whether it can go out, and the day it last went out. The open attributions come
 * first, then the latest rentré: three are enough to tell.
 */
export async function listTerritoryRows(
  db: TransactionClient,
  congregationId: number,
  {
    where,
    today,
    campaignMode,
    origin,
  }: { where: Prisma.TerritoryWhereInput; today: string; campaignMode: boolean; origin?: LatLng },
): Promise<TerritoryListRow[]> {
  const territories = await db.territory.findMany({
    where: { ...where, congregationId },
    select: {
      id: true,
      number: true,
      type: true,
      entrances: {
        select: {
          homes: true,
          phones: true,
          kind: true,
          isPMR: true,
          latitude: true,
          longitude: true,
          buildings: { where: { active: true }, select: { latitude: true, longitude: true } },
        },
      },
      attributions: {
        orderBy: [{ endDate: { sort: 'desc', nulls: 'first' } }, { startDate: 'desc' }],
        take: 3,
        select: attributionSelect,
      },
      // biome-ignore lint/style/useNamingConvention: Prisma's aggregate key
      _count: { select: { attributions: true } },
    },
  })

  return territories.map(territory => {
    const open = territory.attributions.filter(a => a.endDate == null)
    const worked = open.find(a => a.pausedAt == null) ?? open[0]
    const latest = [...territory.attributions].sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0]
    return {
      id: territory.id,
      number: territory.number,
      type: territory.type as TerritoryKindKey,
      quantity: {
        homes: territory.entrances.reduce((sum, entrance) => sum + (entrance.homes ?? 0), 0),
        phones: territory.entrances.reduce((sum, entrance) => sum + (entrance.phones ?? 0), 0),
        entrances: territory.entrances.length,
      },
      pmr: getTerritoryPmrStatus(
        territory.type as TerritoryKindKey,
        territory.entrances as { kind: EntranceKind; isPMR: boolean | null }[],
      ),
      hasHistory: territory._count.attributions > 0,
      holder: worked == null ? null : holderRow(worked, today),
      availability: availabilityOf(territory.attributions, today, campaignMode),
      lastDay: latest != null ? formatLocalDate(latest.startDate) : null,
      distance: distanceOf(origin, territory.entrances),
    }
  })
}

function holderRow(attribution: Loaded, today: string): TerritoryHolder {
  const lateDay = formatLocalDate(attribution.lateDate)
  const publisher = holderOf(attribution.publisher)
  return {
    attributionId: attribution.id,
    state: attributionState({
      today,
      lateDay,
      paused: attribution.pausedAt != null,
      gone: publisher.anonymized || publisher.leftDay != null,
    }),
    lateDay,
    publisher,
    campaign: campaignOf(attribution.campaign),
    pausedBy: attribution.pausedByCampaign,
  }
}

/** Held while an attribution is open (paused for a campaign: free for it); otherwise from the latest rentré one. */
function availabilityOf(attributions: Loaded[], today: string, campaignMode: boolean): Availability {
  const open = attributions.filter(a => a.endDate == null)
  const last = open.find(a => a.pausedAt == null) ?? open[0] ?? attributions[0]
  return territoryAvailability({
    last:
      last == null
        ? null
        : {
            type: last.type as TerritoryAttributionKind,
            campaignId: last.campaignId,
            campaignRestDays: last.campaign?.restPeriodDays ?? null,
            endDay: last.endDate != null ? formatLocalDate(last.endDate) : null,
            paused: last.pausedAt != null,
          },
    today,
    campaignMode,
  })
}
