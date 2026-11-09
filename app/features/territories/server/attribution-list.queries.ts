import type { Prisma } from '~/database/generated/client'
import { type AttributionListRow, attributionState } from '~/features/territories/model/attribution-list'
import { restDaysAfter } from '~/features/territories/model/resting-periods'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { formatLocalDate } from '~/shared/utils/date.server'
import { haversineMeters, type LatLng } from '~/shared/utils/distance'

import { closestTerritoryPoint } from './proximity-sort.server'

// Days travel as `YYYY-MM-DD` in the convention they were saved with (server-local, see `parseLocalDate`): shown as
// calendar days, they read the same for everyone.

const placeSelect = {
  select: {
    latitude: true,
    longitude: true,
    buildings: { where: { active: true }, select: { latitude: true, longitude: true } },
  },
} as const

/**
 * The congregation's open attributions matching `where`, each with its state on `today`. With an `origin`, each row
 * also says how far its territory lies from it, for the proximity order.
 */
export async function listOpenAttributions(
  db: TransactionClient,
  congregationId: number,
  { where, today, origin }: { where: Prisma.AttributionWhereInput; today: string; origin?: LatLng },
): Promise<AttributionListRow[]> {
  const rows = await db.attribution.findMany({
    where: { ...where, congregationId, endDate: null },
    select: {
      id: true,
      type: true,
      startDate: true,
      lateDate: true,
      pausedAt: true,
      campaign: { select: { id: true, name: true, endDate: true, restPeriodDays: true } },
      pausedByCampaign: { select: { name: true } },
      territory: { select: { id: true, number: true, type: true, entrances: placeSelect } },
      publisher: { select: { id: true, firstname: true, lastname: true, leftAt: true, anonymizedAt: true } },
    },
    orderBy: [{ startDate: 'asc' }],
  })

  return rows.map(row => {
    const lateDay = formatLocalDate(row.lateDate)
    const publisher = holderOf(row.publisher)
    return {
      id: row.id,
      type: row.type as TerritoryAttributionKind,
      startDay: formatLocalDate(row.startDate),
      lateDay,
      state: attributionState({
        today,
        lateDay,
        paused: row.pausedAt != null,
        gone: publisher.anonymized || publisher.leftDay != null,
      }),
      territory: { id: row.territory.id, number: row.territory.number, type: row.territory.type as TerritoryKindKey },
      publisher,
      campaign: campaignOf(row.campaign),
      pausedBy: row.pausedByCampaign,
      restDays: restDaysAfter({
        type: row.type,
        campaignId: row.campaign?.id ?? null,
        campaignRestDays: row.campaign?.restPeriodDays ?? null,
      }),
      distance: distanceOf(origin, row.territory.entrances),
    }
  })
}

/** A publisher as the attributions show them: an anonymised one keeps no name, one who left says when. */
export function holderOf(publisher: {
  id: number
  firstname: string | null
  lastname: string | null
  leftAt: Date | null
  anonymizedAt: Date | null
}): AttributionListRow['publisher'] {
  const anonymized = publisher.anonymizedAt != null
  return {
    id: publisher.id,
    firstname: anonymized ? null : publisher.firstname,
    lastname: anonymized ? null : publisher.lastname,
    leftDay: publisher.leftAt != null ? formatLocalDate(publisher.leftAt) : null,
    anonymized,
  }
}

export function campaignOf(
  campaign: { id: number; name: string; endDate: Date } | null,
): AttributionListRow['campaign'] {
  return campaign == null ? null : { id: campaign.id, name: campaign.name, endDay: formatLocalDate(campaign.endDate) }
}

/** Metres from `origin` to the nearest placed point of a territory; null without an origin or a placed point. */
export function distanceOf(
  origin: LatLng | undefined,
  entrances: Parameters<typeof closestTerritoryPoint>[1],
): number | null {
  if (origin == null) return null
  const point = closestTerritoryPoint(origin, entrances)
  return point == null ? null : haversineMeters(origin, point)
}
