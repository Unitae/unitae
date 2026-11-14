import type { Prisma } from '~/database/generated/client'
import type { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { getTerritoryPmrStatus, type PmrStatus } from '~/features/territories/model/pmr-status'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { type Availability, territoryAvailability } from '~/features/territories/model/territory-availability'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { formatLocalDate } from '~/shared/utils/date.server'
import type { LatLng } from '~/shared/utils/distance'

import { distanceOf } from './attribution-list.queries'

export interface AssignableTerritory {
  id: number
  number: string
  type: TerritoryKindKey
  quantity: { homes: number; phones: number; entrances: number }
  pmr: PmrStatus | null
  /** Its latest attribution; an anonymised publisher keeps no name. */
  last: { firstname: string | null; lastname: string | null; startDay: string; endDay: string | null } | null
  /** Its attributions worked this theocratic year: still out, or back since `yearStart`. */
  yearCount: number
  availability: Availability
  /** Metres from the searched place; null when nothing of it is placed, or no place was searched. */
  distance: number | null
}

/**
 * The territories of the congregation nobody holds — during a campaign, nobody actively works: a paused attribution
 * frees its territory for the campaign — each with its latest attribution and whether it can go out on `today`.
 */
export async function listAssignableTerritories(
  db: TransactionClient,
  congregationId: number,
  {
    where,
    today,
    yearStart,
    campaignMode,
    origin,
  }: { where: Prisma.TerritoryWhereInput; today: string; yearStart: Date; campaignMode: boolean; origin?: LatLng },
): Promise<AssignableTerritory[]> {
  const territories = await db.territory.findMany({
    where: {
      ...where,
      congregationId,
      attributions: campaignMode ? { none: { endDate: null, pausedAt: null } } : { none: { endDate: null } },
    },
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
          ...(origin != null
            ? {
                latitude: true,
                longitude: true,
                buildings: { where: { active: true }, select: { latitude: true, longitude: true } },
              }
            : {}),
        },
      },
      attributions: {
        orderBy: [{ startDate: 'desc' }],
        take: 1,
        select: {
          type: true,
          campaignId: true,
          startDate: true,
          endDate: true,
          pausedAt: true,
          campaign: { select: { restPeriodDays: true } },
          publisher: { select: { firstname: true, lastname: true, anonymizedAt: true } },
        },
      },
      // Every kind counts, campaign work included: one out in August and back in October was worked this year.
      // biome-ignore lint/style/useNamingConvention: Prisma's relation count key
      _count: { select: { attributions: { where: { OR: [{ endDate: null }, { endDate: { gte: yearStart } }] } } } },
    },
  })

  return territories.map(territory => {
    const last = territory.attributions[0]
    const endDay = last?.endDate != null ? formatLocalDate(last.endDate) : null
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
      last: last == null ? null : lastOf(last, endDay),
      yearCount: territory._count.attributions,
      availability: territoryAvailability({
        last:
          last == null
            ? null
            : {
                type: last.type as TerritoryAttributionKind,
                campaignId: last.campaignId,
                campaignRestDays: last.campaign?.restPeriodDays ?? null,
                endDay,
                paused: last.pausedAt != null,
              },
        today,
        campaignMode,
      }),
      distance: distanceOf(origin, territory.entrances as unknown as Parameters<typeof distanceOf>[1]),
    }
  })
}

/** The latest attribution as the list shows it: an anonymised publisher keeps no name. */
function lastOf(
  last: {
    startDate: Date
    publisher: { firstname: string | null; lastname: string | null; anonymizedAt: Date | null }
  },
  endDay: string | null,
): AssignableTerritory['last'] {
  const anonymized = last.publisher.anonymizedAt != null
  return {
    firstname: anonymized ? null : last.publisher.firstname,
    lastname: anonymized ? null : last.publisher.lastname,
    startDay: formatLocalDate(last.startDate),
    endDay,
  }
}
