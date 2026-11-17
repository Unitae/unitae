import { redirect } from 'react-router'
import { attendanceRights } from '~/features/events/model/attendance-access'
import { listMeetingsUnderWay, nextCountedMeeting } from '~/features/events/server/attendance.queries'
import { AttendanceEntryCard } from '~/features/events/ui/AttendanceEntryCard'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { PageHeader } from '~/shared/ui/PageHeader'
import { formatEventDate, formatEventTime } from '~/shared/utils/event-time'

import type { Route } from './+types/index'

export const meta: Route.MetaFunction = () => [{ title: m.attendance_page_meta_title() }]

/**
 * The meetings under way today, for whoever enters or corrects attendance: the same card as on the dashboard. Outside
 * a meeting, when the entry opens next.
 */
export function loader({ context }: Route.LoaderArgs) {
  const rights = attendanceRights(context.get(permissionsContext))
  if (!(rights.canRecord || rights.canCorrect)) throw redirect('/')
  const account = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)
  const now = new Date()

  return withScopeFromContext(context, async db => {
    const congregationId = account.congregationId
    const meetings = await listMeetingsUnderWay(db, { congregationId, timeZone: timezone, now })
    const next = meetings.length === 0 ? await nextCountedMeeting(db, { congregationId, now }) : null
    return { meetings, next, viewer: { actorId: account.id, ...rights, timeZone: timezone }, now }
  })
}

export default function AttendancePage({ loaderData }: Route.ComponentProps) {
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
