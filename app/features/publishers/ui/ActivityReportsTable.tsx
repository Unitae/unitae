import { Avatar, Status, type StatusTone, Tag } from '@unitae/ui'
import { Pencil } from 'lucide-react'
import { Link } from 'react-router'

import { type ReportStatus, reportStatus } from '~/features/publishers/model/report-month'
import * as m from '~/i18n/paraglide/messages'
import type { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

import { serviceShortLabel } from './publisher-type-labels'

export interface ActivityReportRow {
  id: number
  firstname: string
  lastname: string
  publisherGroup: { id: number; name: string } | null
  wasInactive: boolean
  notRegular: boolean
  /** The viewer may open this month's report: file it when missing, change it when filed. */
  editable: boolean
  lastActivity: {
    id: number
    type: PublisherType
    isPublisher: boolean
    hours: number | null
    studies: number
    notes: string
    creditHours: number | null
  } | null
}

const STATUS: Record<Exclude<ReportStatus, 'inactive'>, { tone: StatusTone; label: () => string }> = {
  filed: { tone: 'success', label: () => m.activity_status_filed() },
  missing: { tone: 'neutral', label: () => m.activity_status_missing() },
  'not-preached': { tone: 'warning', label: () => m.activity_status_not_preached() },
}

const headClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const cellClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 group-last:border-b-0'
const wideOnly = 'max-md:hidden'
// Beside the docked panel the table narrows: the observations go first, then the group (it is in the strip above).
const roomyOnly = '@max-[50rem]:hidden'
const groupColumn = '@max-[42rem]:hidden'
const numberClass = 'text-right tabular-nums'

interface ActivityReportsTableProps {
  rows: ActivityReportRow[]
  selectedId: number | null
  onOpen: (row: ActivityReportRow, trigger: HTMLElement) => void
}

/** The month's reports, one publisher per row; a row the viewer may change opens its report in the side panel. */
export function ActivityReportsTable({ rows, selectedId, onOpen }: ActivityReportsTableProps) {
  return (
    <div className="@container overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead className={wideOnly}>
          <tr>
            <th className={headClass}>{m.activity_table_name()}</th>
            <th className={cn(headClass, groupColumn)}>{m.activity_table_group()}</th>
            <th className={headClass}>{m.activity_table_report()}</th>
            <th className={headClass}>{m.activity_table_pioneer()}</th>
            <th className={cn(headClass, 'text-right')}>{m.activity_table_hours()}</th>
            <th className={cn(headClass, 'text-right')}>{m.activity_table_credit()}</th>
            <th className={cn(headClass, 'text-right')}>{m.activity_table_studies_short()}</th>
            <th className={cn(headClass, roomyOnly)}>{m.activity_table_observations()}</th>
            <th className={cn(headClass, 'w-20')}>
              <span className="sr-only">{m.activity_table_actions()}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <ReportRow key={row.id} row={row} selected={row.id === selectedId} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReportRow({
  row,
  selected,
  onOpen,
}: {
  row: ActivityReportRow
  selected: boolean
  onOpen: ActivityReportsTableProps['onOpen']
}) {
  const name = formatPersonName(row)
  const status = reportStatus(row)
  const report = row.lastActivity
  const service = report ? serviceShortLabel(report.type) : null
  const pioneer = service != null

  return (
    <tr
      className={cn(
        'group relative transition-colors duration-(--u-duration-fast)',
        selected ? 'bg-selected' : row.editable && 'hover:bg-hover',
        status === 'inactive' && 'text-muted-foreground',
      )}
    >
      <td className={cn(cellClass, 'max-md:h-auto max-md:whitespace-normal max-md:py-2.5')}>
        <span className="flex items-center gap-2 max-md:gap-3">
          <Avatar name={name} className="max-md:size-7 max-md:text-[11px]" />
          <span className="flex min-w-0 flex-col gap-1">
            {row.editable ? (
              <button
                type="button"
                onClick={event => onOpen(row, event.currentTarget)}
                className="truncate text-left font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
              >
                {name}
              </button>
            ) : (
              <Link to={`/publishers/${row.id}/view`} className="truncate font-medium hover:underline">
                {name}
              </Link>
            )}
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-normal text-muted-foreground text-xs md:hidden">
              {row.publisherGroup && <span>{formatGroupName(row.publisherGroup.name)}</span>}
              <StatusMark status={status} />
              {service && <Tag>{service}</Tag>}
            </span>
          </span>
        </span>
      </td>
      <td className={cn(cellClass, wideOnly, groupColumn, 'text-muted-foreground')}>
        {row.publisherGroup ? formatGroupName(row.publisherGroup.name) : <span className="text-faint">—</span>}
      </td>
      <td className={cn(cellClass, wideOnly)}>
        <StatusMark status={status} />
      </td>
      <td className={cn(cellClass, wideOnly)}>{service && <Tag>{service}</Tag>}</td>
      <td className={cn(cellClass, wideOnly, numberClass)}>
        {pioneer && report?.hours != null && m.activity_hours_value({ hours: report.hours })}
      </td>
      <td className={cn(cellClass, wideOnly, numberClass, 'text-muted-foreground')}>
        {pioneer && report?.creditHours ? m.activity_hours_value({ hours: report.creditHours }) : null}
      </td>
      <td className={cn(cellClass, wideOnly, numberClass)}>{report?.studies}</td>
      <td className={cn(cellClass, wideOnly, roomyOnly, 'max-w-48')}>
        {report?.notes ? (
          <span className="block truncate text-muted-foreground" title={report.notes}>
            {report.notes}
          </span>
        ) : null}
      </td>
      <td className={cn(cellClass, 'relative z-10 w-20 px-2 text-right max-md:h-auto')}>
        {row.editable && status === 'missing' && (
          <Button type="button" variant="outline" size="sm" onClick={event => onOpen(row, event.currentTarget)}>
            {m.activity_row_enter()}
          </Button>
        )}
        {row.editable && report != null && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.activity_row_edit({ name })}
            onClick={event => onOpen(row, event.currentTarget)}
            className="opacity-0 transition-opacity duration-(--u-duration-fast) focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 max-md:hidden"
          >
            <Pencil />
          </Button>
        )}
      </td>
    </tr>
  )
}

function StatusMark({ status }: { status: ReportStatus }) {
  if (status === 'inactive') return <Tag>{m.activity_status_inactive()}</Tag>
  const { tone, label } = STATUS[status]
  return <Status tone={tone}>{label()}</Status>
}
