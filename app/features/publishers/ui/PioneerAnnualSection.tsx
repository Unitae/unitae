import { Avatar, ProgressBar, SectionHeading, Sparkline, Status, Tag } from '@unitae/ui'

import type { PioneerAnnualRow } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { openRowOnClick } from '~/shared/ui/row-click'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'
import { hoursText, overdueLabel, paceLine, paceStatus, rosterSubline } from './pioneer-pace-copy'

const headClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const cellClass = 'border-border border-b px-3.5 py-2.5 align-middle group-last:border-b-0'

interface PioneerAnnualSectionProps {
  rows: PioneerAnnualRow[]
  serviceYear: number
  selectedId: number | null
  onOpen: (row: PioneerAnnualRow, trigger: HTMLElement) => void
}

/** The annual pioneers, most behind first: the pace, the hours against the goal to date, the year month by month. */
export function PioneerAnnualSection({ rows, serviceYear, selectedId, onOpen }: PioneerAnnualSectionProps) {
  if (rows.length === 0) return null

  return (
    <section aria-labelledby="pioneers-annual" className="flex flex-col gap-2">
      <SectionHeading
        id="pioneers-annual"
        title={m.pioneers_section_annual()}
        meta={rows.filter(row => !row.concluded).length}
        actions={<span className="text-faint text-xs">{m.pioneers_section_annual_hint()}</span>}
      />
      <div className="@container overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="max-md:hidden">
            <tr>
              <th className={headClass}>{m.activity_table_name()}</th>
              <th className={headClass}>{m.pioneers_col_rhythm()}</th>
              <th className={headClass}>{m.pioneers_col_hours_to_date()}</th>
              <th className={cn(headClass, '@max-[44rem]:hidden')}>{m.pioneers_col_year()}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <AnnualRow
                key={row.memberId}
                row={row}
                serviceYear={serviceYear}
                selected={row.memberId === selectedId}
                onOpen={onOpen}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function AnnualRow({
  row,
  serviceYear,
  selected,
  onOpen,
}: {
  row: PioneerAnnualRow
  serviceYear: number
  selected: boolean
  onOpen: PioneerAnnualSectionProps['onOpen']
}) {
  const name = formatPersonName(row)
  const status = paceStatus(row)
  const overdue = overdueLabel(row, serviceYear)
  const { pace } = row
  const goal = row.concluded ? pace.fullYearTarget : pace.targetToDate

  return (
    <tr
      onClick={openRowOnClick}
      className={cn(
        'group relative cursor-pointer transition-colors duration-(--u-duration-fast)',
        selected ? 'bg-selected' : 'hover:bg-hover',
        row.concluded && 'text-muted-foreground',
      )}
    >
      <td className={cellClass}>
        <span className="flex items-center gap-2.5">
          <Avatar name={name} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <button
              type="button"
              onClick={event => onOpen(row, event.currentTarget)}
              data-row-primary
              className="truncate text-left font-medium outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
            >
              {name}
            </button>
            <span className="text-faint text-xs">
              {rosterSubline(row, serviceYear, row.groupName ? formatGroupName(row.groupName) : null)}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:hidden">
              {status && <Status tone={status.tone}>{status.label}</Status>}
              {paceLine(row) && <span className="text-faint">{paceLine(row)}</span>}
              <span className="tabular-nums">
                {hoursText(pace.achievedToDate)} {m.pioneers_of_goal({ goal: hoursText(goal) })}
              </span>
            </span>
          </span>
        </span>
      </td>
      <td className={cn(cellClass, 'max-md:hidden')}>
        <span className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            {status && <Status tone={status.tone}>{status.label}</Status>}
            {row.concluded && <Tag>{m.pioneers_concluded()}</Tag>}
            {overdue && <Tag>{overdue}</Tag>}
          </span>
          {paceLine(row) && <span className="text-faint text-xs">{paceLine(row)}</span>}
        </span>
      </td>
      <td className={cn(cellClass, 'max-md:hidden')}>
        <span className="flex flex-col gap-1">
          <span className="tabular-nums">
            <b className="font-medium">{hoursText(pace.achievedToDate)}</b>{' '}
            <span className="text-faint text-sm">{m.pioneers_of_goal({ goal: hoursText(goal) })}</span>
          </span>
          <ProgressBar value={pace.achievedToDate} max={goal} tone="muted" className="w-24" />
          {pace.creditToDate > 0 && (
            <span className="text-faint text-xs">{m.pioneers_credit_included({ hours: pace.creditToDate })}</span>
          )}
        </span>
      </td>
      <td className={cn(cellClass, 'max-md:hidden @max-[44rem]:hidden')}>
        <Sparkline
          values={pace.monthStates.map((state, index) =>
            state === 'reported' ? (pace.monthlyHours[index] ?? 0) + (pace.monthlyCredits[index] ?? 0) : state,
          )}
          goal={row.monthlyRate}
          muted={row.concluded}
          className="w-28"
        />
      </td>
    </tr>
  )
}
