import { type DashboardVisibility, dashboardVisibility } from '~/features/dashboard/model/dashboard-visibility'
import { type GroupSummary, summarizeGroup } from '~/features/dashboard/model/group-summary'
import {
  getConflictingAssignments,
  getRecentDocuments,
  getUnreadDocumentCount,
  getUpcomingAbsences,
  getUserTerritories,
} from '~/features/dashboard/server/dashboard.server'
import { getAtRiskPioneers } from '~/features/dashboard/server/get-at-risk-pioneers.server'
import { getManagementMetrics } from '~/features/dashboard/server/get-management-metrics.server'
import { getOnboardingProgress, type OnboardingSteps } from '~/features/dashboard/server/get-onboarding-progress.server'
import { getOpenParts } from '~/features/dashboard/server/get-open-parts.server'
import { getReportProgress } from '~/features/dashboard/server/get-report-progress.server'
import { getResponsibleConflicts } from '~/features/dashboard/server/get-responsible-conflicts.server'
import { getRollChanges } from '~/features/dashboard/server/get-roll-changes.server'
import { getTerritoryTrend } from '~/features/dashboard/server/get-territory-trend.server'
import { getUpcomingAssignments } from '~/features/dashboard/server/get-upcoming-assignments.server'
import { hasCalendarFeed } from '~/features/dashboard/server/has-calendar-feed.server'
import { hasHeldTerritory } from '~/features/dashboard/server/has-held-territory.server'
import { nextMeetingForViewer } from '~/features/dashboard/server/next-meeting-for-viewer.server'
import { getResponsibleTemplateIds } from '~/features/events/server/events-auth.server'
import { getGroup } from '~/features/publishers/server/groups.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { zonedNow } from '~/shared/utils/zoned-now'

/** A block the viewer holds a responsibility for: its data, or null when its query failed. Absent: not theirs. */
export type Block<T> = { data: T | null } | null

export type PersonalStep = 'two-factor'
export type SetupStep = keyof OnboardingSteps

const OPEN_PARTS_HORIZON_DAYS = 28

interface DashboardContext {
  account: {
    id: number
    firstname: string | null
    twoFactorEnabledAt: Date | null
    onboardingDismissedAt: Date | null
    member: {
      id: number
      firstname: string | null
      publisherGroupId: number | null
      responsibleFor: { id: number } | null
      deputyFor: { id: number } | null
    } | null
  }
  permissions: ReadonlySet<Permission>
  congregation: { id: number; timezone: string }
}

/**
 * Everything the dashboard shows one viewer, and nothing more: each block runs only when
 * `dashboardVisibility` gives it to them, and a failing block is reported in place instead of
 * taking the page down.
 */
export async function loadDashboard(db: TransactionClient, context: DashboardContext, now: Date = new Date()) {
  const { account, permissions, congregation } = context
  const visibility = dashboardVisibility({ permissions, member: account.member })
  const congregationId = congregation.id
  const memberId = account.member?.id ?? null
  const local = zonedNow(congregation.timezone, now)
  const dismissed = account.onboardingDismissedAt != null

  const safe = async <T>(label: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run()
    } catch (error) {
      logger.error(`Dashboard widget "${label}" failed for user ${account.id}`, error)
      return null
    }
  }
  const forMember = <T>(label: string, run: (id: number) => Promise<T>) =>
    memberId == null ? Promise.resolve(null) : safe(label, () => run(memberId))
  const when = <T>(applies: unknown, label: string, run: () => Promise<T>) =>
    applies ? safe(label, run) : Promise.resolve(null)
  const block = async <T>(applies: unknown, label: string, run: () => Promise<T>): Promise<Block<T>> =>
    applies ? { data: await safe(label, run) } : null

  const [
    territories,
    heldTerritory,
    assignments,
    dayoffConflict,
    absences,
    meeting,
    responsibleConflicts,
    recentDocuments,
    unreadDocuments,
    programmes,
    territoryFigures,
    reportProgress,
    pioneers,
    roll,
    group,
    adminSetup,
    calendarFeed,
  ] = await Promise.all([
    forMember('territories', id => getUserTerritories(db, id)),
    forMember('territory-history', id => hasHeldTerritory(db, id, congregationId)),
    forMember('upcoming-assignments', id => getUpcomingAssignments(db, id, congregationId)),
    forMember('dayoff-conflict', id => getConflictingAssignments(db, id)),
    safe('absences', () => getUpcomingAbsences(db, account.id, congregationId)),
    safe('next-meeting', () =>
      nextMeetingForViewer(db, {
        accountId: account.id,
        memberId,
        congregationId,
        permissions,
        audience: visibility.meetingAudience,
      }),
    ),
    when(visibility.responsibleConflicts, 'responsible-conflicts', () =>
      getResponsibleConflicts(db, account.id, congregationId, permissions.has(Permission.CanManagePrograms)),
    ),
    when(visibility.documents, 'documents', () => getRecentDocuments(db, account.id, congregationId)),
    when(visibility.documents, 'unread-count', () => getUnreadDocumentCount(db, account.id, congregationId)),
    loadOpenParts(),
    block(visibility.territories, 'territory-figures', async () => {
      // The trend is extra: if it fails, the figures still show, without their curve.
      const [metrics, trend] = await Promise.all([
        getManagementMetrics(db, now, { includeTerritories: true, includePublishers: false }),
        safe('territory-trend', () => getTerritoryTrend(db, congregationId, congregation.timezone, now)),
      ])
      return metrics.territories == null ? null : { ...metrics.territories, trend }
    }),
    block(visibility.activity, 'report-progress', () =>
      getReportProgress(db, congregationId, congregation.timezone, now),
    ),
    when(visibility.activity, 'at-risk-pioneers', () => getAtRiskPioneers(db, congregationId, local)),
    block(visibility.roll, 'roll', () => getRollChanges(db, congregationId, congregation.timezone, now)),
    loadGroup(),
    when(visibility.setup && !dismissed, 'onboarding', () =>
      getOnboardingProgress(db, { accountId: account.id, memberId, congregationId }),
    ),
    when(memberId != null, 'calendar-feed', () => hasCalendarFeed(db, account.id)),
  ])

  // Programme assigners see every meeting; a responsible, only the meeting types they answer for.
  async function loadOpenParts(): Promise<Block<Awaited<ReturnType<typeof getOpenParts>>>> {
    if (visibility.programmes == null) return null
    const templateIds = permissions.has(Permission.CanAssignProgramParts)
      ? null
      : await safe('responsible-templates', () => getResponsibleTemplateIds(db, account.id, congregationId))
    if (templateIds != null && templateIds.length === 0) return null
    return {
      data: await safe('open-parts', () =>
        getOpenParts(db, congregationId, { templateIds: templateIds ?? null, days: OPEN_PARTS_HORIZON_DAYS, now }),
      ),
    }
  }

  async function loadGroup(): Promise<Block<GroupSummary & { canRecord: boolean }>> {
    const led = visibility.group
    if (led == null) return null
    const data = await safe('group', async () => {
      const found = await getGroup(db, led.groupId, congregationId, { timezone: congregation.timezone, now })
      return found == null ? null : { ...summarizeGroup(found), canRecord: led.canRecord }
    })
    return { data }
  }

  return {
    firstname: displayName(account),
    timezone: congregation.timezone,
    visibility,
    personal:
      memberId == null
        ? null
        : personalBlocks({ territories, heldTerritory, assignments, calendarFeed, dayoffConflict }),
    absences,
    meeting,
    responsibleConflicts,
    documents: visibility.documents ? { data: documentsData(recentDocuments, unreadDocuments) } : null,
    programmes,
    territories: territoryFigures,
    activity: reportProgress == null ? null : { progress: reportProgress, pioneers },
    roll,
    group,
    setup: setupFor(visibility, adminSetup, account),
  }
}

// `||`, not `??`: an account can carry an empty-string name.
function displayName(account: DashboardContext['account']) {
  return account.member?.firstname || account.firstname || null
}

function personalBlocks<T, A, D>(found: {
  territories: T[] | null
  heldTerritory: boolean | null
  assignments: A
  calendarFeed: boolean | null
  dayoffConflict: D
}) {
  return {
    territories: found.territories,
    // Never shown empty to someone who never held a territory; a failed query still shows its error.
    showTerritories: found.territories == null || found.territories.length > 0 || found.heldTerritory === true,
    assignments: found.assignments,
    // Asked where it helps, in the assignments block, and only until they subscribe.
    needsCalendar: found.calendarFeed === false,
    dayoffConflict: found.dayoffConflict,
  }
}

function documentsData<T>(recent: T | null, unread: number | null) {
  return recent == null ? null : { recent, unread: unread ?? 0 }
}

// « Premiers pas » lists only what is still to do, and closes for good once dismissed or done.
function setupFor(
  visibility: DashboardVisibility,
  admin: Awaited<ReturnType<typeof getOnboardingProgress>> | null,
  account: DashboardContext['account'],
): { admin: SetupStep[] | null; personal: PersonalStep[]; accountId: number } | null {
  if (account.onboardingDismissedAt != null) return null
  const adminSteps =
    admin == null || admin.complete
      ? null
      : (Object.keys(admin.steps) as SetupStep[]).filter(step => !admin.steps[step])
  const personal: PersonalStep[] = []
  if (visibility.suggestTwoFactor && account.twoFactorEnabledAt == null) personal.push('two-factor')
  if ((adminSteps == null || adminSteps.length === 0) && personal.length === 0) return null
  return { admin: adminSteps, personal, accountId: account.id }
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>
