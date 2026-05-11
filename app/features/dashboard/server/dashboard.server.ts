// Intentional cross-feature import: dashboard aggregates data from events and the board for the overview
import { getNextDaysOffs } from '~/features/events/server/days-off.server'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'

async function buildSectionVisibilityFilter(db: TransactionClient, userId: number, congregationId: number) {
  const viewerRoleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  return {
    section: {
      OR: [{ visibilityRoles: { none: {} } }, { visibilityRoles: { some: { roleId: { in: viewerRoleIds } } } }],
    },
  }
}

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000

export type TerritoryStatus = 'on-time' | 'due-soon' | 'overdue'

function computeTerritoryStatus(lateDate: Date): TerritoryStatus {
  const now = new Date()
  if (lateDate < now) return 'overdue'
  if (lateDate.getTime() - now.getTime() <= TWO_WEEKS_MS) return 'due-soon'
  return 'on-time'
}

export async function getUserTerritories(db: TransactionClient, userId: number) {
  const attributions = await db.attribution.findMany({
    where: {
      publisherId: userId,
      endDate: null,
    },
    select: {
      id: true,
      startDate: true,
      lateDate: true,
      territory: {
        select: {
          id: true,
          number: true,
          type: true,
        },
      },
    },
    orderBy: { lateDate: 'asc' },
  })

  return attributions.map(a => ({
    ...a,
    status: computeTerritoryStatus(a.lateDate),
  }))
}

export async function getRecentDocuments(db: TransactionClient, userId: number, congregationId: number) {
  const now = new Date()
  const visibleNow = {
    OR: [
      { visibleFrom: { lte: now }, visibleUntil: { gte: now } },
      { visibleFrom: { lte: now }, visibleUntil: null },
    ],
  }
  const sectionVisibility = await buildSectionVisibilityFilter(db, userId, congregationId)

  const [recentPdfs, recentDynamic] = await Promise.all([
    db.boardDocument.findMany({
      where: {
        congregationId,
        ...visibleNow,
        ...sectionVisibility,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        viewedBy: {
          where: { id: { equals: userId } },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    db.boardDynamicDocumentSettings.findMany({
      where: {
        congregationId,
        ...visibleNow,
        ...sectionVisibility,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        dynamicType: true,
        views: {
          where: { userId },
          select: { viewedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])

  const documents = [
    ...recentPdfs.map(d => ({
      kind: 'pdf' as const,
      id: d.id,
      title: d.title,
      createdAt: d.createdAt,
      alreadyViewed: d.viewedBy.length > 0,
    })),
    ...recentDynamic.map(d => ({
      kind: 'dynamic' as const,
      id: d.id,
      title: d.title,
      createdAt: d.createdAt,
      alreadyViewed: d.views.length > 0,
    })),
  ]

  documents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return documents.slice(0, 5)
}

export async function getUnreadDocumentCount(db: TransactionClient, userId: number, congregationId: number) {
  const now = new Date()
  const visibleNow = {
    OR: [
      { visibleFrom: { lte: now }, visibleUntil: { gte: now } },
      { visibleFrom: { lte: now }, visibleUntil: null },
    ],
  }
  const sectionVisibility = await buildSectionVisibilityFilter(db, userId, congregationId)

  const [unreadPdfCount, unreadDynamicCount] = await Promise.all([
    db.boardDocument.count({
      where: {
        congregationId,
        ...visibleNow,
        ...sectionVisibility,
        viewedBy: { none: { id: userId } },
      },
    }),
    db.boardDynamicDocumentSettings.count({
      where: {
        congregationId,
        ...visibleNow,
        ...sectionVisibility,
        views: { none: { userId } },
      },
    }),
  ])

  return unreadPdfCount + unreadDynamicCount
}

export async function getUpcomingAbsences(db: TransactionClient, userId: number, congregationId: number) {
  const absences = await getNextDaysOffs(db, userId, congregationId)
  const upcoming = absences.slice(0, 3)

  const twoMonthsFromNow = new Date()
  twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2)
  const shouldNudge = absences.length === 0 || absences.every(a => a.startDate > twoMonthsFromNow)

  return { upcoming, shouldNudge }
}

export async function getUpcomingAssignments(db: TransactionClient, userId: number) {
  const now = new Date()

  const [partAssignments, serviceRoleAssignments] = await Promise.all([
    db.programmePartAssignment.findMany({
      where: {
        OR: [{ assigneeId: userId }, { assistantId: userId }],
        event: { startDate: { gte: now } },
      },
      select: {
        id: true,
        name: true,
        topic: true,
        assigneeId: true,
        assistantId: true,
        event: {
          select: {
            name: true,
            startDate: true,
          },
        },
      },
      orderBy: { event: { startDate: 'asc' } },
      take: 5,
    }),
    db.programmeServiceRoleAssignment.findMany({
      where: {
        assigneeId: userId,
        event: { startDate: { gte: now } },
      },
      select: {
        id: true,
        name: true,
        event: {
          select: {
            name: true,
            startDate: true,
          },
        },
      },
      orderBy: { event: { startDate: 'asc' } },
      take: 5,
    }),
  ])

  type Assignment = {
    kind: 'part' | 'service-role'
    id: number
    name: string
    topic?: string | null
    role: 'speaker' | 'assistant' | 'service'
    eventName: string
    eventDate: Date
  }

  const assignments: Assignment[] = [
    ...partAssignments.map(
      (a): Assignment => ({
        kind: 'part',
        id: a.id,
        name: a.name,
        topic: a.topic,
        role: a.assigneeId === userId ? 'speaker' : 'assistant',
        eventName: a.event.name,
        eventDate: a.event.startDate,
      }),
    ),
    ...serviceRoleAssignments.map(
      (a): Assignment => ({
        kind: 'service-role',
        id: a.id,
        name: a.name,
        role: 'service',
        eventName: a.event.name,
        eventDate: a.event.startDate,
      }),
    ),
  ]

  assignments.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())
  return assignments.slice(0, 5)
}

export async function getNextMeeting(db: TransactionClient, userId: number) {
  const now = new Date()

  const event = await db.event.findFirst({
    where: { startDate: { gte: now } },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      kind: { select: { name: true, color: true } },
      partAssignments: {
        select: {
          id: true,
          name: true,
          section: true,
          topic: true,
          order: true,
          assignee: { select: { id: true, firstname: true, lastname: true } },
          assistant: { select: { id: true, firstname: true, lastname: true } },
        },
        orderBy: { order: 'asc' },
      },
      serviceRoleAssignments: {
        select: {
          id: true,
          name: true,
          assignee: { select: { id: true, firstname: true, lastname: true } },
        },
      },
    },
    orderBy: { startDate: 'asc' },
  })

  if (!event) return null

  const userPartIds = new Set(
    event.partAssignments.filter(p => p.assignee?.id === userId || p.assistant?.id === userId).map(p => p.id),
  )
  const userServiceRoleIds = new Set(event.serviceRoleAssignments.filter(r => r.assignee?.id === userId).map(r => r.id))

  return {
    ...event,
    userPartIds: [...userPartIds],
    userServiceRoleIds: [...userServiceRoleIds],
  }
}
