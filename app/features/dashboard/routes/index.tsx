import { loadDashboard } from '~/features/dashboard/server/load-dashboard.server'
import { AbsencesSection } from '~/features/dashboard/ui/AbsencesSection'
import { buildUrgentItems } from '~/features/dashboard/ui/build-urgent-items'
import { formatMeetingWhen, formatTodayLabel } from '~/features/dashboard/ui/dashboard-format'
import { MyTerritoriesSection } from '~/features/dashboard/ui/MyTerritoriesSection'
import { SetupChecklist } from '~/features/dashboard/ui/SetupChecklist'
import { UpcomingAssignmentsSection } from '~/features/dashboard/ui/UpcomingAssignmentsSection'
import { UrgentList } from '~/features/dashboard/ui/UrgentList'
import { hasWideColumn, WideColumn } from '~/features/dashboard/ui/WideColumn'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'

import type { Route } from './+types/index'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Accueil - Unitae' }]
}

export function loader({ context }: Route.LoaderArgs) {
  const account = context.get(currentAccountContext)
  const permissions = context.get(permissionsContext)
  const congregation = context.get(congregationContext)
  return withScopeFromContext(context, db =>
    loadDashboard(db, {
      account,
      permissions,
      congregation: { id: account.congregationId, timezone: congregation.timezone },
    }),
  )
}

function summary(count: number): string {
  if (count === 0) return m.dashboard_summary_none()
  if (count === 1) return m.dashboard_summary_one()
  return m.dashboard_summary_many({ count: String(count) })
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const data = loaderData
  const { personal, timezone } = data
  const meeting = data.meeting?.showCard ? data.meeting : null

  const urgentItems = buildUrgentItems({
    territories: personal?.territories ?? null,
    unreadDocumentCount: data.documents?.data?.unread ?? null,
    nextMeeting: data.meeting?.meeting ?? null,
    dayoffConflict: personal?.dayoffConflict ?? null,
    responsibleConflicts: data.responsibleConflicts,
    openSlots: data.programmes?.data ?? null,
    group: data.group?.data ?? null,
  })

  // The viewer's own blocks: « À traiter » leads, then their week.
  const side = (
    <>
      <UrgentList items={urgentItems} />
      {personal && (
        <UpcomingAssignmentsSection
          assignments={personal.assignments}
          timeZone={timezone}
          needsCalendar={personal.needsCalendar}
        />
      )}
      {personal?.showTerritories && <MyTerritoriesSection territories={personal.territories} />}
      <AbsencesSection
        absences={data.absences?.upcoming ?? null}
        shouldNudge={data.absences?.shouldNudge ?? false}
        timeZone={timezone}
      />
    </>
  )

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7">
      <div className="flex animate-fade-in-up flex-col gap-1">
        <p className="font-medium text-faint text-xs">{formatTodayLabel(new Date(), timezone)}</p>
        <h1 className="font-semibold text-2xl tracking-tight">
          {data.firstname
            ? `${m.dashboard_greeting_hello()} ${data.firstname}`
            : // Sign-up asks for no name, so a fresh admin account has none.
              m.dashboard_greeting_hello_standalone()}
        </h1>
        <p className="text-muted-foreground text-sm">
          {summary(urgentItems.length)}
          {meeting && ` — ${meeting.meeting.name} ${formatMeetingWhen(meeting.meeting.startDate, timezone)}`}
        </p>
      </div>

      {data.setup && (
        <div className="animate-fade-in-up" style={{ animationDelay: '60ms' }}>
          <SetupChecklist admin={data.setup.admin} personal={data.setup.personal} accountId={data.setup.accountId} />
        </div>
      )}

      {hasWideColumn(data) ? (
        // From lg: the viewer's own blocks in the side column, responsibilities and the congregation
        // in the wide one. On phones the side column comes first, so « À traiter » leads.
        <div
          className="grid animate-fade-in-up gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex min-w-0 flex-col gap-7 lg:col-start-2 lg:row-start-1">{side}</div>
          <div className="flex min-w-0 flex-col gap-7 lg:col-start-1 lg:row-start-1">
            <WideColumn data={data} />
          </div>
        </div>
      ) : (
        // Only the viewer's own blocks: they flow into balanced columns instead of leaving one empty.
        <div
          className="animate-fade-in-up gap-7 md:columns-2 lg:columns-3 [&>*]:mb-7 [&>*]:break-inside-avoid"
          style={{ animationDelay: '120ms' }}
        >
          {side}
        </div>
      )}
    </div>
  )
}
