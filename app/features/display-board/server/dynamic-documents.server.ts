import {
  type AvailableDynamicType,
  DynamicType,
  type ProgrammeDynamicConfig,
  parseProgrammeConfig,
} from '~/features/display-board/model/dynamic-document.type'
import type { TransactionClient } from '~/shared/infra/db.server'

const PIONEER_TYPES = ['PionnierPermanant', 'PionnierSpecial', 'Missionnaire']

export type { AvailableDynamicType, ProgrammeDynamicConfig }
export { parseProgrammeConfig }

function startOfCurrentMonth(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
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

  const groupCount = await db.publisherGroup.count({ where: { congregationId } })
  if (groupCount > 0) {
    available.push({
      dynamicType: DynamicType.PublisherGroups,
      dynamicRef: null,
      defaultTitle: 'Groupes de prédication',
      alreadyAdded: isAlreadyAdded(DynamicType.PublisherGroups, null),
    })
  }

  const pioneerCount = await db.user.count({
    where: { congregationId, type: { in: PIONEER_TYPES }, active: true },
  })
  if (pioneerCount > 0) {
    available.push({
      dynamicType: DynamicType.Pioneers,
      dynamicRef: null,
      defaultTitle: 'Pionniers',
      alreadyAdded: isAlreadyAdded(DynamicType.Pioneers, null),
    })
  }

  // Programme: always available (users can create multiple with different configs)
  const templateCount = await db.programmeTemplate.count({ where: { congregationId } })
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
  // biome-ignore lint/suspicious/noExplicitAny: dynamicConfig is raw JSON from DB
  dynamicConfig?: any,
): Promise<Date | null> {
  if (dynamicType === DynamicType.PublisherGroups) {
    const [group, memberUser] = await Promise.all([
      db.publisherGroup.findFirst({
        where: { congregationId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      db.user.findFirst({
        where: { congregationId, publisherGroupId: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ])

    return maxDate(group?.updatedAt, memberUser?.updatedAt)
  }

  if (dynamicType === DynamicType.Pioneers) {
    const pioneer = await db.user.findFirst({
      where: { congregationId, type: { in: PIONEER_TYPES } },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    })
    return pioneer?.updatedAt ?? null
  }

  if (dynamicType === DynamicType.Programme) {
    const config = parseProgrammeConfig(dynamicConfig)
    const fromDate = startOfCurrentMonth()

    if (config) {
      // Multi-template: check across all configured templates
      const templateIds = config.templates.map(t => t.templateId)
      const [event, assignment] = await Promise.all([
        db.event.findFirst({
          where: { congregationId, templateId: { in: templateIds }, startDate: { gte: fromDate } },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        db.programmePartAssignment.findFirst({
          where: { congregationId, event: { templateId: { in: templateIds }, startDate: { gte: fromDate } } },
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
          where: { congregationId, template: { key: dynamicRef }, startDate: { gte: fromDate } },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        db.programmePartAssignment.findFirst({
          where: {
            congregationId,
            event: { template: { key: dynamicRef }, startDate: { gte: fromDate } },
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
export async function getDynamicPreview(
  db: TransactionClient,
  dynamicType: string,
  dynamicRef: string | null,
  congregationId: number,
  // biome-ignore lint/suspicious/noExplicitAny: dynamicConfig is raw JSON from DB
  dynamicConfig?: any,
): Promise<string | null> {
  if (dynamicType === DynamicType.PublisherGroups) {
    const count = await db.publisherGroup.count({ where: { congregationId } })
    return count > 0 ? `${count} groupes` : null
  }

  if (dynamicType === DynamicType.Pioneers) {
    const count = await db.user.count({
      where: { congregationId, type: { in: PIONEER_TYPES }, active: true },
    })
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
      where: { congregationId, ...templateFilter, startDate: { gte: new Date() } },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    })

    if (nextEvent) {
      const formatted = nextEvent.startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
      return `Prochain : ${formatted}`
    }

    return null
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
      // biome-ignore lint/style/useNamingConvention: prisma compound key
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
        where: { active: true, isPublisher: true },
        select: { ...userSelect, type: true },
        orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
      },
    },
    orderBy: { name: 'asc' },
  })
}

function fetchPioneers(db: TransactionClient, congregationId: number) {
  return db.user.findMany({
    where: { congregationId, type: { in: PIONEER_TYPES }, active: true },
    select: { ...userSelect, type: true },
    orderBy: [{ type: 'asc' }, { lastname: 'asc' }, { firstname: 'asc' }],
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
    },
    include: {
      template: true,
      partAssignments: {
        orderBy: [{ order: 'asc' }, { trackOrder: { sort: 'asc', nulls: 'last' } }],
        include: {
          assignee: { select: userSelect },
          assistant: { select: userSelect },
        },
      },
      serviceRoleAssignments: includeServices ? { include: { assignee: { select: userSelect } } } : false,
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
    },
    include: {
      partAssignments: {
        orderBy: [{ order: 'asc' }, { trackOrder: { sort: 'asc', nulls: 'last' } }],
        include: {
          assignee: { select: userSelect },
          assistant: { select: userSelect },
        },
      },
      serviceRoleAssignments: showServices ? { include: { assignee: { select: userSelect } } } : false,
    },
    orderBy: { startDate: 'asc' },
  })
}
