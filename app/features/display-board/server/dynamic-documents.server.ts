import {
  type AvailableDynamicType,
  DynamicType,
  type ProgrammeDynamicConfig,
  parseProgrammeConfig,
} from '~/features/display-board/model/dynamic-document.type'
import {
  fetchOrganigramDocument,
  getOrganigramPreview,
  getOrganigramVersion,
  hasOrganigram,
} from '~/features/display-board/server/organigram-document.server'
// Cross-feature import via the events barrel (deep-importing another
// feature's model directly is forbidden by the boundaries lint rule).
import { EventStatus } from '~/features/events'
import type { TransactionClient } from '~/shared/infra/db.server'
import { PublisherType } from '~/shared/types/publisher-type'

// Section order on the board: auxiliaries (permanent + one-month) first, then the standing types.
const PIONEER_TYPE_RANK: Record<string, number> = {
  [PublisherType.PionnierAuxiliaires]: 0,
  [PublisherType.PionnierPermanant]: 1,
  [PublisherType.PionnierSpecial]: 2,
  [PublisherType.Missionnaire]: 3,
}

export type { AvailableDynamicType, ProgrammeDynamicConfig }
export { parseProgrammeConfig }

export function startOfCurrentMonth(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

// The board shows who is a pioneer *right now*. That is the set of enrolment stints covering the
// current calendar month — start on or before it, and either ongoing (no end) or ending on or after
// it (endpoint-inclusive). This is the SQL translation of the canonical `coversMonth()` predicate in
// the publishers pioneer-enrolment model. This is the only correct
// source: it captures one-month auxiliaries (whose Member.type stays Normal) and, by construction,
// excludes future stints (start next month) and past ones (ended before this month). Pairs with a
// `member: { leftAt/inactiveAt/anonymizedAt: null }` filter at every call site.
function currentEnrolmentWhere(now: Date) {
  const month = now.getMonth()
  const year = now.getFullYear()
  return {
    AND: [
      { OR: [{ startYear: { lt: year } }, { startYear: year, startMonth: { lte: month } }] },
      { OR: [{ endMonth: null }, { endYear: { gt: year } }, { endYear: year, endMonth: { gte: month } }] },
    ],
  }
}

// A stint covers the current month, and its member is an active publisher (not left/inactive/scrubbed).
function currentPioneerWhere(congregationId: number) {
  return {
    congregationId,
    ...currentEnrolmentWhere(new Date()),
    member: { leftAt: null, inactiveAt: null, anonymizedAt: null },
  }
}

/**
 * Returns available dynamic document types for the congregation.
 * Programme is listed once (not per template) since the new config supports multi-template.
 */
export async function listAvailableDynamicTypes(
  db: TransactionClient,
  congregationId: number,
): Promise<AvailableDynamicType[]> {
  const existing = await db.boardDynamicDocumentSettings.findMany({
    where: { congregationId },
    select: { dynamicType: true, dynamicRef: true },
  })
  const existingKeys = new Set(existing.map(e => `${e.dynamicType}|${e.dynamicRef ?? ''}`))

  const isAlreadyAdded = (type: DynamicType, ref: string | null) => existingKeys.has(`${type}|${ref ?? ''}`)

  const available: AvailableDynamicType[] = []

  if (await hasOrganigram(db, congregationId)) {
    available.push({
      dynamicType: DynamicType.Organigram,
      dynamicRef: null,
      defaultTitle: 'Organigramme',
      alreadyAdded: isAlreadyAdded(DynamicType.Organigram, null),
    })
  }

  const groupCount = await db.publisherGroup.count({ where: { congregationId } })
  if (groupCount > 0) {
    available.push({
      dynamicType: DynamicType.PublisherGroups,
      dynamicRef: null,
      defaultTitle: 'Groupes de prédication',
      alreadyAdded: isAlreadyAdded(DynamicType.PublisherGroups, null),
    })
  }

  const pioneerCount = await db.pioneerEnrolment.count({ where: currentPioneerWhere(congregationId) })
  if (pioneerCount > 0) {
    available.push({
      dynamicType: DynamicType.Pioneers,
      dynamicRef: null,
      defaultTitle: 'Pionniers',
      alreadyAdded: isAlreadyAdded(DynamicType.Pioneers, null),
    })
  }

  // Programme: always available (users can create multiple with different configs)
  const templateCount = await db.eventTemplate.count({ where: { congregationId } })
  if (templateCount > 0) {
    available.push({
      dynamicType: DynamicType.Programme,
      dynamicRef: null,
      defaultTitle: 'Programme',
      alreadyAdded: false,
    })
  }

  return available
}

/**
 * Returns the latest modification date of the underlying data for change detection.
 */
export async function getContentVersion(
  db: TransactionClient,
  dynamicType: string,
  dynamicRef: string | null,
  congregationId: number,
  dynamicConfig?: unknown,
): Promise<Date | null> {
  if (dynamicType === DynamicType.Organigram) {
    return getOrganigramVersion(db, congregationId)
  }

  if (dynamicType === DynamicType.PublisherGroups) {
    const [group, memberUser] = await Promise.all([
      db.publisherGroup.findFirst({
        where: { congregationId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      db.member.findFirst({
        where: { congregationId, publisherGroupId: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ])

    return maxDate(group?.updatedAt, memberUser?.updatedAt)
  }

  if (dynamicType === DynamicType.Pioneers) {
    // Version tracks both the stint (created/closed/edited) and the member (identity, lifecycle),
    // so the board re-renders when either side of the current roster changes.
    const rows = await db.pioneerEnrolment.findMany({
      where: currentPioneerWhere(congregationId),
      select: { updatedAt: true, member: { select: { updatedAt: true } } },
    })
    return maxDate(...rows.flatMap(row => [row.updatedAt, row.member.updatedAt]))
  }

  if (dynamicType === DynamicType.Programme) {
    const config = parseProgrammeConfig(dynamicConfig)
    const fromDate = startOfCurrentMonth()

    if (config) {
      // Multi-template: check across all configured templates
      const templateIds = config.templates.map(t => t.templateId)
      const [event, assignment] = await Promise.all([
        db.event.findFirst({
          where: {
            congregationId,
            templateId: { in: templateIds },
            startDate: { gte: fromDate },
            status: EventStatus.Released,
          },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        db.eventPart.findFirst({
          where: {
            congregationId,
            event: { templateId: { in: templateIds }, startDate: { gte: fromDate }, status: EventStatus.Released },
          },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
      ])
      return maxDate(event?.updatedAt, assignment?.updatedAt)
    }

    // Legacy: single template via dynamicRef
    if (dynamicRef) {
      const [event, assignment] = await Promise.all([
        db.event.findFirst({
          where: {
            congregationId,
            template: { key: dynamicRef },
            startDate: { gte: fromDate },
            status: EventStatus.Released,
          },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        db.eventPart.findFirst({
          where: {
            congregationId,
            event: { template: { key: dynamicRef }, startDate: { gte: fromDate }, status: EventStatus.Released },
          },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
      ])
      return maxDate(event?.updatedAt, assignment?.updatedAt)
    }
  }

  return null
}

function maxDate(...dates: (Date | null | undefined)[]): Date | null {
  const valid = dates.filter((d): d is Date => d instanceof Date)
  if (valid.length === 0) return null
  return valid.reduce((max, d) => (d.getTime() > max.getTime() ? d : max))
}

/**
 * Returns a short preview string for a dynamic document card on the board index.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles many dynamic document types in a single function
export async function getDynamicPreview(
  db: TransactionClient,
  dynamicType: string,
  dynamicRef: string | null,
  congregationId: number,
  dynamicConfig?: unknown,
): Promise<string | null> {
  if (dynamicType === DynamicType.PublisherGroups) {
    const count = await db.publisherGroup.count({ where: { congregationId } })
    return count > 0 ? `${count} groupes` : null
  }

  if (dynamicType === DynamicType.Pioneers) {
    // No-overlap invariant → at most one covering stint per member, so this counts distinct pioneers.
    const count = await db.pioneerEnrolment.count({ where: currentPioneerWhere(congregationId) })
    return count > 0 ? `${count} pionniers` : null
  }

  if (dynamicType === DynamicType.Programme) {
    const config = parseProgrammeConfig(dynamicConfig)

    // Build template filter
    const templateFilter = config
      ? { templateId: { in: config.templates.map(t => t.templateId) } }
      : dynamicRef
        ? { template: { key: dynamicRef } }
        : null

    if (!templateFilter) return null

    const nextEvent = await db.event.findFirst({
      where: { congregationId, ...templateFilter, startDate: { gte: new Date() }, status: EventStatus.Released },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    })

    if (nextEvent) {
      const formatted = nextEvent.startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
      return `Prochain : ${formatted}`
    }

    return null
  }

  if (dynamicType === DynamicType.Organigram) {
    return getOrganigramPreview(db, congregationId)
  }

  return null
}

export async function markDynamicDocumentViewed(
  db: TransactionClient,
  settingsId: number,
  userId: number,
): Promise<void> {
  await db.boardDynamicDocumentView.upsert({
    where: {
      settingsId_userId: { settingsId, userId },
    },
    create: { settingsId, userId, viewedAt: new Date() },
    update: { viewedAt: new Date() },
  })
}

const userSelect = { id: true, firstname: true, lastname: true, anonymizedAt: true } as const

/**
 * Fetches live data for a dynamic document. Dispatches by type.
 */
export async function getDynamicDocumentData(
  db: TransactionClient,
  dynamicType: string,
  dynamicRef: string | null,
  congregationId: number,
  options: { showServices?: boolean; dynamicConfig?: unknown } = {},
) {
  if (dynamicType === DynamicType.Organigram) {
    return { type: DynamicType.Organigram, tree: await fetchOrganigramDocument(db, congregationId) } as const
  }

  if (dynamicType === DynamicType.PublisherGroups) {
    return {
      type: DynamicType.PublisherGroups,
      groups: await fetchPublisherGroups(db, congregationId),
    } as const
  }

  if (dynamicType === DynamicType.Pioneers) {
    return {
      type: DynamicType.Pioneers,
      pioneers: await fetchPioneers(db, congregationId),
    } as const
  }

  if (dynamicType === DynamicType.Programme) {
    const config = parseProgrammeConfig(options.dynamicConfig)

    if (config) {
      // Multi-template mode: fetch events for all configured templates
      const templateIds = config.templates.map(t => t.templateId)
      const anyServices = config.templates.some(t => t.services)
      const events = await fetchProgrammeByIds(db, congregationId, templateIds, anyServices)
      return {
        type: DynamicType.Programme,
        events,
        config,
        // Legacy compat fields
        templateKey: null,
        showServices: anyServices,
      } as const
    }

    // Legacy: single template via dynamicRef
    if (dynamicRef) {
      const events = await fetchProgrammeByKey(db, congregationId, dynamicRef, options.showServices ?? false)
      return {
        type: DynamicType.Programme,
        events,
        config: null,
        templateKey: dynamicRef,
        showServices: options.showServices ?? false,
      } as const
    }
  }

  return null
}

function fetchPublisherGroups(db: TransactionClient, congregationId: number) {
  return db.publisherGroup.findMany({
    where: { congregationId },
    include: {
      responsible: { select: userSelect },
      deputy: { select: userSelect },
      members: {
        where: { leftAt: null, isPublisher: true, inactiveAt: null },
        select: userSelect,
        orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
      },
    },
    orderBy: { name: 'asc' },
  })
}

async function fetchPioneers(db: TransactionClient, congregationId: number) {
  // The stint's type is authoritative (a one-month auxiliary reads PionnierAuxiliaires here even
  // though Member.type is Normal). Ordering can't be done in SQL because section order follows the
  // custom PIONEER_TYPE_RANK (not the enum's own order), so we sort in JS by rank then name.
  const rows = await db.pioneerEnrolment.findMany({
    where: currentPioneerWhere(congregationId),
    select: { type: true, member: { select: userSelect } },
  })
  return rows
    .map(row => ({ ...row.member, type: row.type }))
    .sort((a, b) => {
      const rank = (PIONEER_TYPE_RANK[a.type] ?? 99) - (PIONEER_TYPE_RANK[b.type] ?? 99)
      if (rank !== 0) return rank
      const last = (a.lastname ?? '').localeCompare(b.lastname ?? '')
      return last !== 0 ? last : (a.firstname ?? '').localeCompare(b.firstname ?? '')
    })
}

function fetchProgrammeByIds(
  db: TransactionClient,
  congregationId: number,
  templateIds: number[],
  includeServices: boolean,
) {
  const fromDate = startOfCurrentMonth()

  return db.event.findMany({
    where: {
      congregationId,
      templateId: { in: templateIds },
      startDate: { gte: fromDate },
      status: EventStatus.Released,
    },
    include: {
      template: true,
      eventParts: {
        orderBy: [{ order: 'asc' }, { trackOrder: { sort: 'asc', nulls: 'last' } }],
        include: {
          assignee: { select: userSelect },
          assistant: { select: userSelect },
          externalSpeaker: { select: { name: true } },
        },
      },
      eventServiceParts: includeServices ? { include: { assignee: { select: userSelect } } } : false,
    },
    orderBy: { startDate: 'asc' },
  })
}

function fetchProgrammeByKey(
  db: TransactionClient,
  congregationId: number,
  templateKey: string,
  showServices: boolean,
) {
  const fromDate = startOfCurrentMonth()

  return db.event.findMany({
    where: {
      congregationId,
      template: { key: templateKey },
      startDate: { gte: fromDate },
      status: EventStatus.Released,
    },
    include: {
      eventParts: {
        orderBy: [{ order: 'asc' }, { trackOrder: { sort: 'asc', nulls: 'last' } }],
        include: {
          assignee: { select: userSelect },
          assistant: { select: userSelect },
          externalSpeaker: { select: { name: true } },
        },
      },
      eventServiceParts: showServices ? { include: { assignee: { select: userSelect } } } : false,
    },
    orderBy: { startDate: 'asc' },
  })
}
