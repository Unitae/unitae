import { type AttributionState, attributionState } from '~/features/territories/model/attribution-list'
import { restDaysAfter } from '~/features/territories/model/resting-periods'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { formatLocalDate } from '~/shared/utils/date.server'

import { findAttributablePublishers } from './attributable-publishers.queries'
import { resolveDurationDays } from './attribution-duration.queries'
import { campaignOf, holderOf } from './attribution-list.queries'
import { getActiveCampaign } from './campaign.queries'

// The side panel of the attributions page: one attribution to change, or a territory to attribute. Days travel as
// `YYYY-MM-DD` in the convention they were saved with (server-local, see `parseLocalDate`).

/** A publisher to choose from, with the territories they already hold and how many of those are late. */
export interface AttributablePerson {
  id: number
  firstname: string | null
  lastname: string | null
  held: number
  late: number
}

export interface PanelTerritory {
  id: number
  number: string
  type: TerritoryKindKey
  quantity: { homes: number; phones: number; entrances: number }
}

const territorySelect = {
  id: true,
  number: true,
  type: true,
  entrances: { select: { homes: true, phones: true } },
} as const

function panelTerritory(territory: {
  id: number
  number: string
  type: string
  entrances: { homes: number | null; phones: number | null }[]
}): PanelTerritory {
  return {
    id: territory.id,
    number: territory.number,
    type: territory.type as TerritoryKindKey,
    quantity: {
      homes: territory.entrances.reduce((sum, entrance) => sum + (entrance.homes ?? 0), 0),
      phones: territory.entrances.reduce((sum, entrance) => sum + (entrance.phones ?? 0), 0),
      entrances: territory.entrances.length,
    },
  }
}

/**
 * The publishers who may take a territory of `kind` (`alwaysIncludeId` stays even when the kind's roles no longer
 * allow them), each with the open attributions they hold and how many are late on `today`. A paused one is held,
 * never late: its clock is frozen.
 */
export async function listAttributablePeople(
  db: TransactionClient,
  congregationId: number,
  {
    kind,
    today,
    alwaysIncludeId,
  }: { kind: TerritoryKindKey | `${TerritoryKindKey}`; today: string; alwaysIncludeId?: number },
): Promise<AttributablePerson[]> {
  const publishers = await findAttributablePublishers(
    db,
    kind as TerritoryKindKey,
    congregationId,
    alwaysIncludeId != null ? { alwaysIncludeMemberId: alwaysIncludeId } : undefined,
  )
  const open = await db.attribution.findMany({
    where: { congregationId, endDate: null, publisherId: { in: publishers.map(publisher => publisher.id) } },
    select: { publisherId: true, lateDate: true, pausedAt: true },
  })
  return publishers.map(publisher => {
    const theirs = open.filter(attribution => attribution.publisherId === publisher.id)
    return {
      id: publisher.id,
      firstname: publisher.firstname,
      lastname: publisher.lastname,
      held: theirs.length,
      late: theirs.filter(a => a.pausedAt == null && formatLocalDate(a.lateDate) <= today).length,
    }
  })
}

export interface AttributionPanelData {
  attribution: {
    id: number
    type: TerritoryAttributionKind
    startDay: string
    lateDay: string
    endDay: string | null
    notes: string
    state: AttributionState
    pausedDay: string | null
    pausedBy: { name: string } | null
    campaign: { id: number; name: string; endDay: string } | null
    /** How long the territory rests once rentré. */
    restDays: number
  }
  territory: PanelTerritory
  publisher: {
    id: number
    firstname: string | null
    lastname: string | null
    leftDay: string | null
    anonymized: boolean
  }
  people: AttributablePerson[]
}

/** One attribution of the congregation as the panel edits it; null when it is not one of the congregation's. */
export async function getAttributionPanel(
  db: TransactionClient,
  congregationId: number,
  id: number,
  today: string,
): Promise<AttributionPanelData | null> {
  const row = await db.attribution.findFirst({
    where: { id, congregationId },
    select: {
      id: true,
      type: true,
      startDate: true,
      lateDate: true,
      endDate: true,
      notes: true,
      pausedAt: true,
      pausedByCampaign: { select: { name: true } },
      campaign: { select: { id: true, name: true, endDate: true, restPeriodDays: true } },
      territory: { select: territorySelect },
      publisher: { select: { id: true, firstname: true, lastname: true, leftAt: true, anonymizedAt: true } },
    },
  })
  if (row == null) return null

  const lateDay = formatLocalDate(row.lateDate)
  const publisher = holderOf(row.publisher)
  const people = await listAttributablePeople(db, congregationId, {
    kind: row.territory.type as TerritoryKindKey,
    today,
    alwaysIncludeId: row.publisher.id,
  })

  return {
    attribution: {
      id: row.id,
      type: row.type as TerritoryAttributionKind,
      startDay: formatLocalDate(row.startDate),
      lateDay,
      endDay: row.endDate != null ? formatLocalDate(row.endDate) : null,
      notes: row.notes,
      state: attributionState({
        today,
        lateDay,
        paused: row.pausedAt != null,
        gone: publisher.anonymized || publisher.leftDay != null,
      }),
      pausedDay: row.pausedAt != null ? formatLocalDate(row.pausedAt) : null,
      pausedBy: row.pausedByCampaign,
      campaign: campaignOf(row.campaign),
      restDays: restDaysAfter({
        type: row.type,
        campaignId: row.campaign?.id ?? null,
        campaignRestDays: row.campaign?.restPeriodDays ?? null,
      }),
    },
    territory: panelTerritory(row.territory),
    publisher,
    people,
  }
}

export interface AssignPanelData {
  territory: PanelTerritory
  /** Its latest attribution; an anonymised publisher keeps no name. */
  last: { firstname: string | null; lastname: string | null; startDay: string; endDay: string | null } | null
  /** The campaign running today: a new attribution goes into it. `closes`: due back when it ends. */
  campaign: { id: number; name: string; endDay: string; closes: boolean } | null
  /** How many days a new attribution runs, by method, outside a campaign that closes them. */
  durationDays: Record<TerritoryAttributionKind, number>
  people: AttributablePerson[]
}

/** A territory of the congregation as the panel attributes it; null when it is not one of the congregation's. */
export async function getAssignPanel(
  db: TransactionClient,
  congregationId: number,
  territoryId: number,
  today: string,
): Promise<AssignPanelData | null> {
  const territory = await db.territory.findFirst({
    where: { id: territoryId, congregationId },
    select: {
      ...territorySelect,
      attributions: {
        orderBy: [{ startDate: 'desc' }],
        take: 1,
        select: {
          startDate: true,
          endDate: true,
          publisher: { select: { firstname: true, lastname: true, anonymizedAt: true } },
        },
      },
    },
  })
  if (territory == null) return null

  const [campaign, defaultDays, phoneDays, people] = await Promise.all([
    getActiveCampaign(db, congregationId),
    resolveDurationDays(db, TerritoryAttributionKind.Default, territory.type, congregationId),
    resolveDurationDays(db, TerritoryAttributionKind.Phone, territory.type, congregationId),
    listAttributablePeople(db, congregationId, { kind: territory.type as TerritoryKindKey, today }),
  ])
  const last = territory.attributions[0]
  const anonymized = last?.publisher.anonymizedAt != null

  return {
    territory: panelTerritory(territory),
    last:
      last == null
        ? null
        : {
            firstname: anonymized ? null : last.publisher.firstname,
            lastname: anonymized ? null : last.publisher.lastname,
            startDay: formatLocalDate(last.startDate),
            endDay: last.endDate != null ? formatLocalDate(last.endDate) : null,
          },
    campaign:
      campaign == null
        ? null
        : {
            id: campaign.id,
            name: campaign.name,
            endDay: formatLocalDate(campaign.endDate),
            closes: campaign.endCloseCampaign,
          },
    durationDays: { [TerritoryAttributionKind.Default]: defaultDays, [TerritoryAttributionKind.Phone]: phoneDays },
    people,
  }
}
