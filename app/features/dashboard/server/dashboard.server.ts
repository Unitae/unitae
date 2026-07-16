// Intentional cross-feature import: dashboard aggregates data from events and the board for the overview
import { EventKind, EventStatus } from '~/features/events'
import { getNextDaysOffs } from '~/features/events/index.server'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import { TWO_WEEKS_MS } from '~/shared/constants/limits'
import { DASHBOARD_RECENT_ITEMS_LIMIT } from '~/shared/constants/pagination'
import type { TransactionClient } from '~/shared/infra/db.server'

async function buildSectionVisibilityFilter(db: TransactionClient, userId: number, congregationId: number) {
  const viewerRoleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  return {
    section: {
      OR: [{ visibilityRoles: { none: {} } }, { visibilityRoles: { some: { roleId: { in: viewerRoleIds } } } }],
    },
  }
}

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
      take: DASHBOARD_RECENT_ITEMS_LIMIT,
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
      take: DASHBOARD_RECENT_ITEMS_LIMIT,
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
        // Drafts are the manager's scratch space — never previewed to
        // publishers.
        event: { startDate: { gte: now }, status: EventStatus.Released },
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
      take: DASHBOARD_RECENT_ITEMS_LIMIT,
    }),
    db.programmeServiceRoleAssignment.findMany({
      where: {
        assigneeId: userId,
        event: { startDate: { gte: now }, status: EventStatus.Released },
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
      take: DASHBOARD_RECENT_ITEMS_LIMIT,
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

export async function getConflictingAssignments(db: TransactionClient, userId: number) {
  const now = new Date()

  const [partConflicts, serviceConflicts] = await Promise.all([
    db.programmePartAssignment.findMany({
      where: {
        hasConflict: true,
        OR: [{ assigneeId: userId }, { assistantId: userId }],
        // Conflicts on a draft event are not urgent — the schedule isn't
        // public yet. They only surface via the events-list amber badge for
        // managers, and block the release step.
        event: { startDate: { gte: now }, status: EventStatus.Released },
      },
      select: {
        id: true,
        name: true,
        event: { select: { startDate: true } },
      },
      orderBy: { event: { startDate: 'asc' } },
      take: 1,
    }),
    db.programmeServiceRoleAssignment.findMany({
      where: {
        hasConflict: true,
        assigneeId: userId,
        event: { startDate: { gte: now }, status: EventStatus.Released },
      },
      select: {
        id: true,
        name: true,
        event: { select: { startDate: true } },
      },
      orderBy: { event: { startDate: 'asc' } },
      take: 1,
    }),
  ])

  // We surface the assignment's own name ("Discours public", "Son", …), not
  // the parent event's name ("Réunion de semaine" — repeats every week and
  // doesn't identify which part is actually clashing with the absence).
  const candidates = [
    ...partConflicts.map(c => ({
      kind: 'part' as const,
      id: c.id,
      name: c.name,
      eventStartDate: c.event.startDate,
    })),
    ...serviceConflicts.map(c => ({
      kind: 'service-role' as const,
      id: c.id,
      name: c.name,
      eventStartDate: c.event.startDate,
    })),
  ]

  candidates.sort((a, b) => a.eventStartDate.getTime() - b.eventStartDate.getTime())
  return candidates.at(0) ?? null
}

export async function getNextMeeting(db: TransactionClient, userId: number) {
  const now = new Date()

  const event = await db.event.findFirst({
    where: {
      startDate: { gte: now },
      // NOT: { kind: {...} } instead of kind: { key: { not } } — the second
      // form inner-joins through kind and silently drops null-kind rows,
      // which seeded templates produce.
      NOT: { kind: { key: EventKind.Off } },
      // Publisher-facing dashboard — drafts must stay hidden.
      status: EventStatus.Released,
    },
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
