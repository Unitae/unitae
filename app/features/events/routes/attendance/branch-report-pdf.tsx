import { redirect } from 'react-router'
import { attendanceRights } from '~/features/events/model/attendance-access'
import { attendanceReport } from '~/features/events/model/attendance-report'
import { listServiceYearAttendance } from '~/features/events/server/attendance.queries'
import { BranchReportDocument } from '~/features/events/ui/pdf/BranchReportDocument'
import { toServiceYear } from '~/features/publishers'
import { getBranchReport } from '~/features/publishers/index.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { isDemoCongregation } from '~/shared/domain/demo-mode.server'
import { renderPdfResponse } from '~/shared/infra/pdf.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/branch-report-pdf'

/** `?month=&year=` (month 0-indexed), or null when either is missing, empty or out of range. */
function parseMonth(params: URLSearchParams): { month: number; year: number } | null {
  const monthParam = params.get('month')
  const yearParam = params.get('year')
  // `Number('')` is 0: an empty value would otherwise pass for January.
  if (monthParam == null || monthParam === '' || yearParam == null || yearParam === '') return null
  const month = Number(monthParam)
  const year = Number(yearParam)
  if (!Number.isInteger(month) || month < 0 || month > 11) return null
  if (!Number.isInteger(year) || year < 2000 || year > 3000) return null
  return { month, year }
}

/**
 * The month's report to the branch, the S-1, as a PDF: the activity page's figures and the active publishers, behind
 * that page's right. The weekend average comes from attendance, so only a reader of attendance gets it filled in.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanViewActivity)) throw redirect('/')
  const period = parseMonth(new URL(request.url).searchParams)
  if (period == null) throw redirect('/publishers/activity')

  const congregation = context.get(congregationContext)
  const { congregationId } = context.get(currentAccountContext)
  const canViewAttendance = attendanceRights(permissions).canView
  const serviceYear = toServiceYear(period.month, period.year)

  const [report, meetings] = await withScopeFromContext(context, db =>
    Promise.all([
      getBranchReport(db, { congregationId, ...period }),
      canViewAttendance
        ? listServiceYearAttendance(db, { congregationId, serviceYear, timeZone: congregation.timezone })
        : Promise.resolve(null),
    ]),
  )
  const weekendAverage =
    meetings == null
      ? null
      : (attendanceReport(meetings, serviceYear).months.find(
          row => row.month === period.month && row.year === period.year,
        )?.weekend.average ?? null)

  return renderPdfResponse(
    <BranchReportDocument
      congregationName={congregation.displayName ?? congregation.name}
      month={period.month}
      year={period.year}
      publishers={report.branch.publishers}
      auxiliary={report.branch.auxiliary}
      regular={report.branch.regular}
      activePublishers={report.activePublishers}
      weekendAverage={weekendAverage}
      secretary={report.secretary}
    />,
    m.branch_report_filename_pdf({ period: `${period.year}-${String(period.month + 1).padStart(2, '0')}` }),
    { demo: isDemoCongregation(congregation) },
  )
}
