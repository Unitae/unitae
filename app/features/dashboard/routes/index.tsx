import { meetingForViewer } from '~/features/dashboard/model/meeting-visibility'
import {
  getConflictingAssignments,
  getNextMeeting,
  getRecentDocuments,
  getUnreadDocumentCount,
  getUpcomingAbsences,
  getUserTerritories,
} from '~/features/dashboard/server/dashboard.server'
import { getAtRiskPioneers } from '~/features/dashboard/server/get-at-risk-pioneers.server'
import { getManagementMetrics } from '~/features/dashboard/server/get-management-metrics.server'
import { getOnboardingProgress } from '~/features/dashboard/server/get-onboarding-progress.server'
import { getResponsibleConflicts } from '~/features/dashboard/server/get-responsible-conflicts.server'
import { getUpcomingAssignments } from '~/features/dashboard/server/get-upcoming-assignments.server'
import { AbsencesSection } from '~/features/dashboard/ui/AbsencesSection'
import { buildUrgentItems } from '~/features/dashboard/ui/build-urgent-items'
import { DocumentsSection } from '~/features/dashboard/ui/DocumentsSection'
import { formatTodayLabel } from '~/features/dashboard/ui/dashboard-format'
import { hasMetricsToShow, MetricsRow } from '~/features/dashboard/ui/MetricsRow'
import { MyTerritoriesSection } from '~/features/dashboard/ui/MyTerritoriesSection'
import { NextMeetingCard } from '~/features/dashboard/ui/NextMeetingCard'
import { OnboardingChecklist } from '~/features/dashboard/ui/OnboardingChecklist'
import { PioneersAtRiskSection } from '~/features/dashboard/ui/PioneersAtRiskSection'
import { QuickActions } from '~/features/dashboard/ui/QuickActions'
import { UpcomingAssignmentsSection } from '~/features/dashboard/ui/UpcomingAssignmentsSection'
import { UrgentList } from '~/features/dashboard/ui/UrgentList'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { zonedNow } from '~/shared/utils/zoned-now'

import type { Route } from './+types/index'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Accueil - Unitae' }]
}

async function safeQuery<T>(label: string, userId: number, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (error) {
    logger.error(`Dashboard widget "${label}" failed for user ${userId}`, error)
    return null
  }
}

// The whole programme only for those who may open it; everyone else gets their own parts.
function visibleMeeting(meeting: Awaited<ReturnType<typeof getNextMeeting>>, canViewPrograms: boolean) {
  return meeting != null ? meetingForViewer(meeting, { schedule: canViewPrograms, conflicts: canViewPrograms }) : null
}

export function loader({ context }: Route.LoaderArgs) {
  const currentUser = context.get(currentAccountContext)
  const permissions = context.get(permissionsContext)
  const isAdmin = permissions.has(Permission.CanDoAnything)
  const isTerritoriesManager = permissions.has(Permission.CanManageTerritories)
  const isProgramManager = permissions.has(Permission.CanManagePrograms)
  const canViewBoard = permissions.has(Permission.CanViewBoard)
  // The responsible-conflict card deep-links to /programs?hasConflicts=true.
  // Gate the query the same way so we don't hand a user a link to a page
  // they cannot open — mirrors the canViewBoard pattern below.
  const canViewPrograms = permissions.has(Permission.CanViewPrograms) || isProgramManager
  const canViewActivity = permissions.has(Permission.CanViewActivity)
  const canCreatePublisher = permissions.has(Permission.CanManagePublishers) || isAdmin
  const canViewPublishers = permissions.has(Permission.CanViewPublishers) || isAdmin
  const canUploadDocument = permissions.has(Permission.CanUploadBoardDocuments) || isAdmin
  const congregation = context.get(congregationContext)

  // Member-bound queries (territories, programme assignments) need the linked
  // Member id; account-bound queries (documents/views) use the UserAccount id.
  // An account with no linked Member (the admin created at sign-up, a circuit
  // overseer) can hold neither, so its member-bound cards are hidden: `null`
  // on those widgets stays reserved for a query that actually failed.
  const memberId = currentUser.member?.id ?? null
  return withScopeFromContext(context, async db => {
    const memberSafeQuery = <T,>(label: string, run: (mid: number) => Promise<T>): Promise<T | null> => {
      if (memberId == null) return Promise.resolve(null)
      return safeQuery(label, currentUser.id, () => run(memberId))
    }

    const [
      territories,
      recentDocuments,
      unreadDocumentCount,
      absences,
      nextMeeting,
      upcomingAssignments,
      dayoffConflict,
      responsibleConflicts,
      atRiskPioneers,
    ] = await Promise.all([
      memberSafeQuery('territories', mid => getUserTerritories(db, mid)),
      canViewBoard
        ? safeQuery('documents', currentUser.id, () =>
            getRecentDocuments(db, currentUser.id, currentUser.congregationId),
          )
        : Promise.resolve(null),
      canViewBoard
        ? safeQuery('unread-count', currentUser.id, () =>
            getUnreadDocumentCount(db, currentUser.id, currentUser.congregationId),
          )
        : Promise.resolve(0),
      safeQuery('absences', currentUser.id, () => getUpcomingAbsences(db, currentUser.id, currentUser.congregationId)),
      memberSafeQuery('next-meeting', mid => getNextMeeting(db, mid, currentUser.congregationId)),
      memberSafeQuery('upcoming-assignments', mid => getUpcomingAssignments(db, mid, currentUser.congregationId)),
      memberSafeQuery('dayoff-conflict', mid => getConflictingAssignments(db, mid)),
      canViewPrograms
        ? safeQuery('responsible-conflicts', currentUser.id, () =>
            getResponsibleConflicts(db, currentUser.id, currentUser.congregationId, isProgramManager),
          )
        : Promise.resolve(null),
      canViewActivity
        ? safeQuery('at-risk-pioneers', currentUser.id, () =>
            getAtRiskPioneers(db, currentUser.congregationId, zonedNow(congregation.timezone)),
          )
        : Promise.resolve(null),
    ])

    const metrics = await safeQuery('management-metrics', currentUser.id, () =>
      getManagementMetrics(db, zonedNow(congregation.timezone), {
        includeTerritories: isAdmin || isTerritoriesManager,
        includePublishers: canViewPublishers,
      }),
    )

    // Admin setup checklist, until the account closes it or the congregation is set up. A failed
    // query hides it rather than show a misleading "incomplete setup".
    const onboarding =
      isAdmin && currentUser.onboardingDismissedAt == null
        ? await safeQuery('onboarding', currentUser.id, () =>
            getOnboardingProgress(db, {
              accountId: currentUser.id,
              memberId,
              congregationId: currentUser.congregationId,
            }),
          )
        : null

    return {
      // `||`, not `??`: an account can carry an empty-string name.
      currentUser: { firstname: currentUser.member?.firstname || currentUser.firstname || null },
      hasMember: memberId != null,
      territories,
      recentDocuments,
      unreadDocumentCount,
      nextMeeting: visibleMeeting(nextMeeting, canViewPrograms),
      upcomingAssignments,
      absences,
      dayoffConflict,
      responsibleConflicts,
      atRiskPioneers,
      // Not sent once every congregation step is done: the checklist has nothing left to ask.
      onboarding: onboarding?.complete === false ? { steps: onboarding.steps, accountId: currentUser.id } : null,
      metrics,
      isAdmin,
      isTerritoriesManager,
      isProgramManager,
      // The programme overview lists everyone's parts: only for those who may open the programmes.
      canViewPrograms,
      // Dates and meeting times are printed in the congregation's zone, on the server and the client.
      timezone: congregation.timezone,
      canCreatePublisher,
      canUploadDocument,
    }
  })
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const {
    currentUser,
    hasMember,
    territories,
    recentDocuments,
    unreadDocumentCount,
    nextMeeting,
    upcomingAssignments,
    absences,
    dayoffConflict,
    responsibleConflicts,
    atRiskPioneers,
    onboarding,
    metrics,
    isAdmin,
    isTerritoriesManager,
    isProgramManager,
    canViewPrograms,
    timezone,
    canCreatePublisher,
    canUploadDocument,
  } = loaderData

  const urgentItems = buildUrgentItems(
    territories,
    unreadDocumentCount,
    nextMeeting,
    dayoffConflict,
    responsibleConflicts,
  )
  const showMeeting = canViewPrograms && nextMeeting != null
  const showPioneers = atRiskPioneers != null && atRiskPioneers.count > 0

  const urgent = <UrgentList items={urgentItems} />
  // Accounts with no member record hold neither territories nor programme parts.
  const personal = hasMember && (
    <>
      <UpcomingAssignmentsSection assignments={upcomingAssignments} timeZone={timezone} />
      <MyTerritoriesSection territories={territories} />
    </>
  )
  const absencesSection = (
    <AbsencesSection
      absences={absences?.upcoming ?? null}
      shouldNudge={absences?.shouldNudge ?? false}
      timeZone={timezone}
    />
  )
  const documentsSection = <DocumentsSection documents={recentDocuments} />

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7">
      <div className="flex animate-fade-in-up flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-faint text-xs">{formatTodayLabel(new Date(), timezone)}</p>
          <h1 className="font-semibold text-2xl tracking-tight">
            {currentUser.firstname
              ? `${m.dashboard_greeting_hello()} ${currentUser.firstname}`
              : // Sign-up asks for no name, so a fresh admin account has none.
                m.dashboard_greeting_hello_standalone()}
          </h1>
        </div>
        <QuickActions
          // Hidden while there is nothing to assign or no one to assign it to. A count the viewer
          // can't see (`null`) or that failed to load leaves the shortcut in place.
          canAssignTerritory={
            (isAdmin || isTerritoriesManager) && metrics?.territories?.total !== 0 && metrics?.publishers?.total !== 0
          }
          canCreatePublisher={canCreatePublisher}
          canUploadDocument={canUploadDocument}
          canCreateProgram={isProgramManager}
        />
      </div>

      {onboarding && <OnboardingChecklist steps={onboarding.steps} accountId={onboarding.accountId} />}

      {metrics && hasMetricsToShow(metrics) && (
        <div className="animate-fade-in-up" style={{ animationDelay: '60ms' }}>
          <MetricsRow metrics={metrics} />
        </div>
      )}

      {showMeeting ? (
        // From lg, a wide column for the programme and a side column for the viewer's own blocks.
        // The side column is split so that on phones « À traiter » and the personal blocks lead,
        // the programme follows, and absences and documents close the page.
        <div
          className="grid animate-fade-in-up gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex min-w-0 flex-col gap-7 lg:col-start-2 lg:row-start-1">
            {urgent}
            {personal}
          </div>
          <div className="flex min-w-0 flex-col gap-7 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {showMeeting && <NextMeetingCard meeting={nextMeeting} timeZone={timezone} />}
            {showPioneers && <PioneersAtRiskSection data={atRiskPioneers} />}
          </div>
          <div className="flex min-w-0 flex-col gap-7 lg:col-start-2 lg:row-start-2">
            {absencesSection}
            {documentsSection}
          </div>
        </div>
      ) : (
        // No programme to show: pioneers (if any) span the width, and the viewer's blocks flow into
        // balanced columns so a short block does not leave a hole beside a tall one.
        <>
          {showPioneers && <PioneersAtRiskSection data={atRiskPioneers} />}
          <div
            className="animate-fade-in-up gap-7 md:columns-2 lg:columns-3 [&>*]:mb-7 [&>*]:break-inside-avoid"
            style={{ animationDelay: '120ms' }}
          >
            {urgent}
            {personal}
            {absencesSection}
            {documentsSection}
          </div>
        </>
      )}
    </div>
  )
}
