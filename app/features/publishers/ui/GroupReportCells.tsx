import { Check, Minus, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { type ActivityMonth, formatActivityMonth, formatShortMonth } from '~/features/publishers/model/activity-months'
import type { ReportStatus } from '~/features/publishers/model/member-signals'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { cn } from '~/shared/utils/utils'

export interface ReportCell extends ActivityMonth {
  status: ReportStatus
  id: number | null
}

const STATUS_LABEL: Record<ReportStatus, () => string> = {
  filed: m.groups_report_filed,
  irregular: m.groups_report_irregular,
  'not-filed': m.groups_report_not_filed,
  'not-expected': m.groups_report_not_expected,
}

// Filled for a report (teal with ministry, amber without), hollow for a missing one, faint when none
// was expected.
const DOT_STYLE: Record<ReportStatus, string> = {
  filed: 'bg-primary',
  irregular: 'bg-amber-500',
  'not-filed': 'border-2 border-destructive/70',
  'not-expected': 'size-1.5 bg-muted-foreground/30',
}

/** The report form for a publisher and month: the report itself when filed, a new one otherwise. */
function reportLink(memberId: number, report: ReportCell): string {
  return report.id != null
    ? `/publishers/activity/${report.id}/edit`
    : `/publishers/activity/new?publisherId=${memberId}&month=${report.month}&year=${report.year}`
}

/**
 * One dot per month of the window, oldest first; each opens that month's report, or a new one. A
 * filed report links only when `canCorrect`: the edit form turns away anyone else.
 */
export function ReportDots({
  memberId,
  reports,
  canCorrect,
}: {
  memberId: number
  reports: ReportCell[]
  canCorrect: boolean
}) {
  const locale = getLocale()
  return (
    <div className="flex items-center justify-center">
      {reports.map(report => {
        const label = m.groups_report_dot_aria({
          date: formatActivityMonth(report, locale, 'long'),
          status: STATUS_LABEL[report.status](),
        })
        const dot = <span className={cn('size-2.5 rounded-full', DOT_STYLE[report.status])} />
        if (report.id != null && !canCorrect) {
          return (
            <span
              key={`${report.year}-${report.month}`}
              role="img"
              aria-label={label}
              title={label}
              className="flex size-6 items-center justify-center"
            >
              {dot}
            </span>
          )
        }
        return (
          // The dot is small; the link around it is a comfortable target on a phone.
          <Link
            key={`${report.year}-${report.month}`}
            to={reportLink(memberId, report)}
            aria-label={label}
            title={label}
            className="flex size-6 items-center justify-center rounded-full hover:bg-accent"
          >
            {dot}
          </Link>
        )
      })}
    </div>
  )
}

const STATUS_ICON: Record<ReportStatus, typeof Check> = {
  filed: Check,
  irregular: Minus,
  'not-filed': Plus,
  'not-expected': Plus,
}

/**
 * The month being reported: its status, as a link to the report or to a new one (a filed report
 * links only when `canCorrect`). On a phone only the icon shows (each status has its own); the
 * label stays for screen readers.
 */
export function ReportStatusLink({
  memberId,
  report,
  canCorrect,
}: {
  memberId: number
  report: ReportCell
  canCorrect: boolean
}) {
  const filed = report.status === 'filed' || report.status === 'irregular'
  const Icon = STATUS_ICON[report.status]
  const className = cn(
    'inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-xs',
    report.status === 'filed' && 'text-primary',
    report.status === 'irregular' && 'text-amber-700 dark:text-amber-400',
    report.status === 'not-filed' && 'text-foreground',
    report.status === 'not-expected' && 'text-muted-foreground',
  )
  const content = (
    <>
      <Icon className="size-3.5" />
      <span className="max-sm:sr-only">{filed ? STATUS_LABEL[report.status]() : m.groups_report_add()}</span>
    </>
  )
  if (filed && !canCorrect) return <span className={className}>{content}</span>
  return (
    <Link to={reportLink(memberId, report)} className={cn(className, 'hover:bg-accent')}>
      {content}
    </Link>
  )
}

/** The heading of the reported month's column: the month alone on a phone. */
export function ReportColumnHeading({ month }: { month: ActivityMonth }) {
  const locale = getLocale()
  return (
    <>
      <span className="sm:hidden">{formatShortMonth(month, locale)}</span>
      <span className="max-sm:hidden">{m.groups_view_report_column({ date: formatActivityMonth(month, locale) })}</span>
    </>
  )
}

/** What the dots mean, once per page. */
export function ReportLegend() {
  const statuses: ReportStatus[] = ['filed', 'irregular', 'not-filed', 'not-expected']
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
      <span>{m.groups_report_legend()} :</span>
      {statuses.map(status => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-full', DOT_STYLE[status])} />
          {STATUS_LABEL[status]()}
        </span>
      ))}
    </p>
  )
}
