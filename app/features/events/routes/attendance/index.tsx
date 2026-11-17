import { redirect } from 'react-router'
import { attendanceRights } from '~/features/events/model/attendance-access'
import type { AttendanceViewer } from '~/features/events/model/attendance-entry'
import { serviceYearFrom } from '~/features/events/model/attendance-overview'
import {
  countsAnyMeeting,
  listMeetingsUnderWay,
  listServiceYearAttendance,
  nextCountedMeeting,
} from '~/features/events/server/attendance.queries'
import { AttendanceEntryCard } from '~/features/events/ui/AttendanceEntryCard'
import { AttendanceYearScreen } from '~/features/events/ui/AttendanceYearScreen'
import { toServiceYear } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { PageHeader } from '~/shared/ui/PageHeader'
import { dayOf } from '~/shared/utils/calendar-day'
import { formatEventDate, formatEventTime } from '~/shared/utils/event-time'

import type { Route } from './+types/index'

export const meta: Route.MetaFunction = () => [{ title: m.attendance_page_meta_title() }]

/**
 * Whoever may read attendance gets the service year: figures, meetings by month, one meeting's counts beside the
 * list. Whoever may only enter it gets the meetings under way today, as on the dashboard, or when the entry opens.
 */
export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const rights = attendanceRights(permissions)
  if (!(rights.canRecord || rights.canCorrect || rights.canView)) throw redirect('/')
  const account = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)
  const now = new Date()
  const viewer = {
    actorId: account.id,
    canRecord: rights.canRecord,
    canCorrect: rights.canCorrect,
    timeZone: timezone,
  } satisfies Omit<AttendanceViewer, 'now'>

  return withScopeFromContext(context, async db => {
    const congregationId = account.congregationId
    if (rights.canView) {
      const today = dayOf(now, timezone)
      const currentServiceYear = toServiceYear(Number(today.slice(5, 7)) - 1, Number(today.slice(0, 4)))
      const serviceYear = serviceYearFrom(new URL(request.url).searchParams.get('year'), currentServiceYear)
      // A year still to come, or no year at all: the address goes back to the current year rather than lie.
      if (serviceYear == null) throw redirect('/attendance')
      const [meetings, previous, counting] = await Promise.all([
        listServiceYearAttendance(db, { congregationId, serviceYear, timeZone: timezone }),
        listServiceYearAttendance(db, { congregationId, serviceYear: serviceYear - 1, timeZone: timezone }),
        countsAnyMeeting(db, congregationId),
      ])
      return {
        mode: 'year' as const,
        meetings,
        previous,
        serviceYear,
        currentServiceYear,
        today,
        now,
        viewer,
        counting,
        canManageTemplates: permissions.has(Permission.CanManageProgramTemplates),
      }
    }
    const meetings = await listMeetingsUnderWay(db, { congregationId, timeZone: timezone, now })
    const next = meetings.length === 0 ? await nextCountedMeeting(db, { congregationId, now }) : null
    return { mode: 'today' as const, meetings, next, viewer, now }
  })
}

export default function AttendancePage({ loaderData }: Route.ComponentProps) {
  if (loaderData.mode === 'year') {
    // Keyed by year: folded months, the view and the open meeting belong to the year they were chosen in.
    return <AttendanceYearScreen key={loaderData.serviceYear} {...loaderData} now={new Date(loaderData.now)} />
  }

  const { meetings, next, viewer, now } = loaderData
  const locale = getLocale()
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <PageHeader title={m.attendance_page_title()} breadcrumbs={[{ label: m.attendance_page_title() }]} />
      {meetings.map(meeting => (
        <AttendanceEntryCard key={meeting.eventId} entry={meeting} viewer={{ ...viewer, now: new Date(now) }} />
      ))}
      {meetings.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {m.attendance_none()}
          {next != null &&
            ` ${m.attendance_next({
              when: m.attendance_next_when({
                date: formatEventDate(next.startDate, viewer.timeZone, locale, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                }),
                time: formatEventTime(next.startDate, viewer.timeZone, locale),
              }),
            })}`}
        </p>
      )}
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
