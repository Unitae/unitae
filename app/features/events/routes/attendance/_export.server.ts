import { redirect } from 'react-router'
import { attendanceRights } from '~/features/events/model/attendance-access'
import { serviceYearFrom } from '~/features/events/model/attendance-overview'
import { listServiceYearAttendance } from '~/features/events/server/attendance.queries'
import { toServiceYear } from '~/features/publishers'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { dayOf } from '~/shared/utils/calendar-day'

type Context = Parameters<typeof withScopeFromContext>[0]

/**
 * What both attendance exports read, behind the attendance page's own guards: « Consulter l’assistance », and the
 * service year the page shows (`?year=`, the current one by default, never one still to come). The year shown and
 * the one before it, as the S-88 card prints them side by side.
 */
export async function loadAttendanceExport(request: Request, context: Context) {
  if (!attendanceRights(context.get(permissionsContext)).canView) throw redirect('/')
  const congregation = context.get(congregationContext)
  const timeZone = congregation.timezone
  const now = new Date()
  const today = dayOf(now, timeZone)
  const current = toServiceYear(Number(today.slice(5, 7)) - 1, Number(today.slice(0, 4)))
  const serviceYear = serviceYearFrom(new URL(request.url).searchParams.get('year'), current)
  if (serviceYear == null) throw redirect('/attendance')
  const { congregationId } = context.get(currentAccountContext)
  const [meetings, previous] = await withScopeFromContext(context, db =>
    Promise.all([
      listServiceYearAttendance(db, { congregationId, serviceYear, timeZone }),
      listServiceYearAttendance(db, { congregationId, serviceYear: serviceYear - 1, timeZone }),
    ]),
  )
  return {
    meetings,
    previous,
    serviceYear,
    timeZone,
    now,
    congregationName: congregation.displayName ?? congregation.name,
  }
}
