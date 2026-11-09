import { Status, type StatusTone } from '@unitae/ui'

import { type ActivityMonth, formatActivityMonth, formatShortMonth } from '~/features/publishers/model/activity-months'
import type { ReportStatus } from '~/features/publishers/model/member-signals'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'

export interface ReportCell extends ActivityMonth {
  status: ReportStatus
  id: number | null
}

/** Opens one month's report in the page's panel; `trigger` gets the focus back when it closes. */
export type OpenReport = (month: ActivityMonth, trigger: HTMLElement) => void

const STATUS_LABEL: Record<ReportStatus, () => string> = {
  filed: m.activity_status_filed,
  irregular: m.activity_status_not_preached,
  'not-filed': m.activity_status_missing,
  'not-expected': m.groups_report_not_expected,
}

// Shape carries the status as much as colour: a full dot, a half one, a dashed ring, a speck.
const DOT_STYLE: Record<ReportStatus, string> = {
  filed: 'bg-faint',
  irregular:
    'bg-[conic-gradient(var(--color-warning)_0_50%,transparent_0)] shadow-[inset_0_0_0_1.5px_var(--color-warning)]',
  'not-filed': 'border-[1.5px] border-danger border-dashed',
  'not-expected': 'size-1 bg-border-strong',
}

const filed = (report: ReportCell) => report.status === 'filed' || report.status === 'irregular'

/** A month the reader may open: a missing report to file, or a filed one he may correct. */
export function opensReport(report: ReportCell, canCorrect: boolean) {
  return filed(report) ? canCorrect : report.status === 'not-filed'
}

function Dot({ status }: { status: ReportStatus }) {
  return <span className={cn('block size-2.5 rounded-full', DOT_STYLE[status])} />
}

/**
 * One dot per month of the window, oldest first; each opens that month's report in the panel. A filed report opens
 * only when `canCorrect`, and a month without a report expected never does.
 */
export function ReportDots({
  reports,
  canCorrect,
  selectedMonth,
  onOpen,
}: {
  reports: ReportCell[]
  canCorrect: boolean
  /** The month open in the panel for this member, if any. */
  selectedMonth: ActivityMonth | null
  onOpen: OpenReport
}) {
  const locale = getLocale()
  return (
    <div className="flex items-center">
      {reports.map(report => {
        const key = `${report.year}-${report.month}`
        const label = m.groups_report_dot_aria({
          date: formatActivityMonth(report, locale, 'long'),
          status: STATUS_LABEL[report.status](),
        })
        if (!opensReport(report, canCorrect)) {
          return (
            <span
              key={key}
              role="img"
              aria-label={label}
              title={label}
              className="flex size-6 items-center justify-center"
            >
              <Dot status={report.status} />
            </span>
          )
        }
        const selected = selectedMonth?.month === report.month && selectedMonth.year === report.year
        return (
          // The dot is small; the button around it is a comfortable target on a phone.
          <button
            key={key}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={selected}
            onClick={event => onOpen(report, event.currentTarget)}
            className={cn(
              'flex size-6 items-center justify-center rounded-full outline-none transition-colors duration-(--u-duration-fast) focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'bg-selected' : 'hover:bg-hover',
            )}
          >
            <Dot status={report.status} />
          </button>
        )
      })}
    </div>
  )
}

const STATUS_TONE: Record<'filed' | 'irregular', StatusTone> = { filed: 'success', irregular: 'warning' }

/** The month being reported: « Saisir » while it is missing, its status once filed. */
export function ReportStatusCell({
  report,
  canCorrect,
  onOpen,
}: {
  report: ReportCell
  canCorrect: boolean
  onOpen: OpenReport
}) {
  if (report.status === 'filed' || report.status === 'irregular') {
    const status = <Status tone={STATUS_TONE[report.status]}>{STATUS_LABEL[report.status]()}</Status>
    if (!canCorrect) return status
    return (
      <button
        type="button"
        onClick={event => onOpen(report, event.currentTarget)}
        className="rounded-md px-1 py-0.5 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
      >
        {status}
      </button>
    )
  }
  if (report.status === 'not-expected') {
    return <span className="text-faint text-xs">{STATUS_LABEL[report.status]()}</span>
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={event => onOpen(report, event.currentTarget)}>
      {m.activity_row_enter()}
    </Button>
  )
}

/** The heading of the reported month's column: the month alone in a narrow table. */
export function ReportColumnHeading({ month }: { month: ActivityMonth }) {
  const locale = getLocale()
  return (
    <>
      <span className="@2xl:hidden">{formatShortMonth(month, locale)}</span>
      <span className="@max-2xl:hidden">
        {m.groups_view_report_column({ date: formatActivityMonth(month, locale) })}
      </span>
    </>
  )
}

/** What the dots mean, once per page. */
export function ReportLegend() {
  const statuses: ReportStatus[] = ['filed', 'irregular', 'not-filed', 'not-expected']
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-faint text-xs">
      {statuses.map(status => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <Dot status={status} />
          {STATUS_LABEL[status]()}
        </span>
      ))}
      <span>· {m.groups_report_legend_hint()}</span>
    </p>
  )
}
