import { Panel, SegmentedControl, Status, StatusIcon } from '@unitae/ui'
import { ChevronRight, Pencil } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import type {
  AttendanceMonth,
  AttendanceView,
  MeetingState,
  MonthRow,
  OverviewMeeting,
} from '~/features/events/model/attendance-overview'
import { isComplete } from '~/features/events/model/attendance-stats'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { formatEventDate } from '~/shared/utils/event-time'
import { cn } from '~/shared/utils/utils'

interface AttendanceMeetingListProps {
  months: AttendanceMonth[]
  view: AttendanceView
  onViewChange: (view: AttendanceView) => void
  /** Meetings held with a count missing, for the view's label. */
  toComplete: number
  selectedId: number | null
  onSelect: (meeting: OverviewMeeting, trigger: HTMLElement) => void
  timeZone: string
}

const CELL = 'h-10 px-3 text-sm'
const NUMBER = cn(CELL, 'text-right tabular-nums')

function StateShape({ state }: { state: MeetingState }) {
  if (state === 'live') return <span aria-hidden="true" className="size-2 rounded-full bg-brand ring-3 ring-selected" />
  const label = state === 'entered' ? m.attendance_state_entered() : m.attendance_state_todo()
  return (
    <span role="img" aria-label={label} className="inline-flex">
      <StatusIcon tone={state === 'entered' ? 'success' : 'warning'} />
    </span>
  )
}

function StateCell({ state }: { state: MeetingState | 'off' }) {
  if (state === 'live')
    return (
      <span className="inline-flex items-center gap-2 text-sm">
        <span aria-hidden="true" className="size-2 rounded-full bg-brand ring-3 ring-selected" />
        {m.attendance_state_live()}
      </span>
    )
  if (state === 'off') return <Status tone="neutral">{m.attendance_state_off()}</Status>
  return state === 'entered' ? (
    <Status tone="success">{m.attendance_state_entered()}</Status>
  ) : (
    <Status tone="warning">{m.attendance_state_todo()}</Status>
  )
}

const kindLabel = (kind: string) =>
  kind === 'midweek' ? m.attendance_kind_midweek() : kind === 'weekend' ? m.attendance_kind_weekend() : null

/**
 * The meetings of the service year by month, the most recent first: the month under way open, past months folded,
 * each with its averages. A row opens the meeting's counts beside the list; a week without a meeting reads as such.
 */
export function AttendanceMeetingList({
  months,
  view,
  onViewChange,
  toComplete,
  selectedId,
  onSelect,
  timeZone,
}: AttendanceMeetingListProps) {
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(months[0] ? [`${months[0].year}-${months[0].month}`] : []),
  )
  const locale = getLocale()
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const day = (date: Date | string) =>
    formatEventDate(date, timeZone, locale, { weekday: 'short', day: 'numeric', month: 'short' })
  const count = (value: number | null) => (value == null ? <span className="text-faint">—</span> : value)
  const empty =
    view === 'todo'
      ? m.attendance_todo_empty()
      : view === 'apart'
        ? m.attendance_apart_empty()
        : m.attendance_list_empty()

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          className="max-md:w-full"
          aria-label={m.attendance_view_group()}
          value={view}
          onValueChange={onViewChange}
          options={[
            { value: 'all', label: m.attendance_view_all() },
            { value: 'todo', label: m.attendance_view_todo({ count: String(toComplete) }) },
            { value: 'apart', label: m.attendance_view_apart() },
          ]}
        />
        <span className="flex-1" />
        <span className="text-faint text-sm max-md:hidden">{m.attendance_newest_first()}</span>
      </div>

      {months.length === 0 ? (
        <p className="py-6 text-muted-foreground text-sm">{empty}</p>
      ) : (
        <Panel aria-label={m.attendance_page_title()}>
          {months.map((month, index) => {
            const key = `${month.year}-${month.month}`
            // Every month of a filtered view is open: it holds only what the view is for.
            const isOpen = view !== 'all' || open.has(key)
            const averages = [
              m.attendance_month_summary({ count: month.entered }),
              month.midweek != null && m.attendance_month_midweek({ average: String(month.midweek) }),
              month.weekend != null && m.attendance_month_weekend({ average: String(month.weekend) }),
            ].filter(Boolean)
            return (
              <div key={key} className={cn(index > 0 && 'border-border border-t')}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpen(current => {
                      const next = new Set(current)
                      if (next.has(key)) next.delete(key)
                      else next.add(key)
                      return next
                    })
                  }
                  className="flex h-10 w-full items-center gap-2 bg-subtle px-3 text-left font-semibold text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      'size-4 shrink-0 text-faint transition-transform duration-(--u-duration-fast) motion-reduce:transition-none',
                      isOpen && 'rotate-90',
                    )}
                  />
                  <span className="first-letter:uppercase">
                    {monthName.format(new Date(Date.UTC(month.year, month.month, 1)))}
                  </span>
                  <span className="ml-auto truncate font-normal text-faint tabular-nums max-md:hidden">
                    {averages.join(' · ')}
                  </span>
                </button>
                {isOpen && (
                  <table className="w-full border-collapse">
                    <thead className="sr-only">
                      <tr>
                        <th>{m.attendance_col_state()}</th>
                        <th>{m.attendance_col_meeting()}</th>
                        <th>{m.attendance_col_in_person()}</th>
                        <th>{m.attendance_col_online()}</th>
                        <th>{m.attendance_col_total()}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {month.rows.map(row => (
                        <Row
                          key={row.type === 'off' ? `off-${row.kind}-${row.monday}` : row.eventId}
                          row={row}
                          selected={row.type === 'meeting' && row.eventId === selectedId}
                          onSelect={onSelect}
                          day={day}
                          count={count}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </Panel>
      )}
    </>
  )
}

function Row({
  row,
  selected,
  onSelect,
  day,
  count,
}: {
  row: MonthRow
  selected: boolean
  onSelect: AttendanceMeetingListProps['onSelect']
  day: (date: Date | string) => string
  count: (value: number | null) => ReactNode
}) {
  // « Semaine du 12 oct. »: the Monday, without its weekday.
  const weekOf = (date: string) =>
    new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date))
  if (row.type === 'off') {
    return (
      <tr className="border-border border-t text-faint">
        <td className={cn(CELL, 'w-40 max-md:hidden')}>
          <StateCell state="off" />
        </td>
        <td className={CELL} colSpan={4}>
          {m.attendance_week_of({ date: weekOf(`${row.monday}T12:00:00Z`) })}
          <span> · {kindLabel(row.kind)}</span>
        </td>
      </tr>
    )
  }
  const date = day(row.startDate)
  const total = isComplete(row) ? row.inPerson + row.online : null
  return (
    <tr
      className={cn(
        'group cursor-pointer border-border border-t transition-colors duration-(--u-duration-fast)',
        selected ? 'bg-selected' : 'hover:bg-hover',
      )}
      onClick={event => onSelect(row, event.currentTarget)}
    >
      <td className={cn(CELL, 'w-40 max-md:hidden')}>
        <StateCell state={row.state} />
      </td>
      {/* On a phone, two lines: the state's shape before the date, the kind under it. */}
      <td className={cn(CELL, 'max-md:h-auto max-md:py-2')}>
        <span className="mr-1.5 inline-flex align-middle md:hidden">
          <StateShape state={row.state} />
        </span>
        <button
          type="button"
          className="rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={m.attendance_open_label({ date })}
          onClick={event => {
            event.stopPropagation()
            onSelect(row, event.currentTarget)
          }}
        >
          {date}
        </button>
        <span className="text-faint max-md:block">
          <span className="max-md:hidden"> · </span>
          {kindLabel(row.kind) ?? row.name}
        </span>
      </td>
      <td className={NUMBER}>{count(row.inPerson)}</td>
      <td className={NUMBER}>{count(row.online)}</td>
      <td className={cn(NUMBER, 'font-medium')}>{count(total)}</td>
      <td className={cn(CELL, 'w-28 text-right max-md:hidden')}>
        {row.state === 'todo' ? (
          <Button size="sm" variant="outline" tabIndex={-1} onClick={event => event.currentTarget.blur()}>
            {m.attendance_complete_button()}
          </Button>
        ) : (
          <Pencil aria-hidden="true" className="ml-auto size-4 text-faint opacity-0 group-hover:opacity-100" />
        )}
      </td>
    </tr>
  )
}
