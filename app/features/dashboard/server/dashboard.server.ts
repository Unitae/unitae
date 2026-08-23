// Intentional cross-feature import: dashboard aggregates data from events and the board for the overview
import { buildSectionVisibilityFilter, resolveProgrammeLink } from '~/features/display-board/index.server'
import { EventStatus, EventTemplateKey } from '~/features/events'
import { getNextDaysOffs } from '~/features/events/index.server'
import { TWO_WEEKS_MS } from '~/shared/constants/limits'
import { DASHBOARD_RECENT_ITEMS_LIMIT } from '~/shared/constants/pagination'
import type { TransactionClient } from '~/shared/infra/db.server'

// The board owns this rule; keeping a second copy here is how the two drift.
async function sectionVisibilityWhere(db: TransactionClient, userId: number, congregationId: number) {
  return { section: await buildSectionVisibilityFilter(db, userId, congregationId) }
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
      // Paused for a campaign: still held, but off the working list — its
      // frozen clock must not surface as an overdue urgent item.
      pausedAt: null,
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
  const sectionVisibility = await sectionVisibilityWhere(db, userId, congregationId)

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
  const sectionVisibility = await sectionVisibilityWhere(db, userId, congregationId)

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

export async function getConflictingAssignments(db: TransactionClient, userId: number) {
  const now = new Date()

  const [partConflicts, serviceConflicts] = await Promise.all([
    db.eventPart.findMany({
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
    db.eventServicePart.findMany({
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

export async function getNextMeeting(db: TransactionClient, userId: number, congregationId: number) {
  const now = new Date()

  const event = await db.event.findFirst({
    where: {
      startDate: { gte: now },
      // NOT: { template: {...} } instead of template: { key: { not } } — the
      // second form inner-joins through template and silently drops null-
      // template rows, which older legacy events might still carry.
      NOT: { template: { key: EventTemplateKey.DayOff } },
      // Publisher-facing dashboard — drafts must stay hidden.
      status: EventStatus.Released,
    },
    select: {
      id: true,
      // Feeds resolveProgrammeLink so the strip can deep-link imminent items
      // instead of pointing at a generic /board.
      templateId: true,
      name: true,
      startDate: true,
      endDate: true,
      template: { select: { name: true, color: true } },
      eventParts: {
        select: {
          id: true,
          name: true,
          section: true,
          topic: true,
          order: true,
          speakerLabel: true,
          readerLabel: true,
          assignee: { select: { id: true, firstname: true, lastname: true } },
          assistant: { select: { id: true, firstname: true, lastname: true } },
        },
        orderBy: { order: 'asc' },
      },
      eventServiceParts: {
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

  // Tag each part with the viewer's role so the UI doesn't have to reverse-
  // engineer it. `null` means "viewer has no role on this part" — the UI
  // filters on userPartIds so nulls never render, but keeping the field
  // present makes the shape uniform and typed.
  const eventParts = event.eventParts.map(p => ({
    ...p,
    viewerRole:
      p.assignee?.id === userId ? ('speaker' as const) : p.assistant?.id === userId ? ('reader' as const) : null,
  }))

  const userPartIds = new Set(eventParts.filter(p => p.viewerRole !== null).map(p => p.id))
  const userServicePartIds = new Set(event.eventServiceParts.filter(r => r.assignee?.id === userId).map(r => r.id))

  // Canonical board link for this meeting, shared with the assignment emails
  // and the upcoming-assignments card.
  const link = await resolveProgrammeLink(db, { id: event.id, templateId: event.templateId }, congregationId)

  return {
    ...event,
    eventParts,
    userPartIds: [...userPartIds],
    userServicePartIds: [...userServicePartIds],
    link,
  }
}
