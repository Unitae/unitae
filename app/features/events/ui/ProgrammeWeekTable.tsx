import { Status } from '@unitae/ui'
import { ChevronRight } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link } from 'react-router'

import { EventStatus } from '~/features/events/model/event-status.type'
import type { ProgrammeRowData } from '~/features/events/model/programme-list.type'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Checkbox } from '~/shared/ui/checkbox'
import { dayOf, startOfDay } from '~/shared/utils/calendar-day'
import { formatEventDate } from '~/shared/utils/event-time'
import { cn } from '~/shared/utils/utils'
import { ProgrammeRow, WIDE_ONLY } from './ProgrammeRow'
import type { PeriodWeek } from './period-weeks'

const HEAD = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'

interface ProgrammeWeekTableProps {
  weeks: PeriodWeek<ProgrammeRowData>[]
  /** Show the weeks without a programme: the gaps a calendar would reveal. Left out while a filter narrows the list. */
  showEmptyWeeks: boolean
  canCreate: boolean
  selected: Set<number>
  onToggle: (id: number) => void
  onToggleAll: (ids: number[], select: boolean) => void
  /** The Monday of this week, `YYYY-MM-DD`. */
  currentWeek: string
  timeZone: string
  now: Date
}

/**
 * The programmes in one table, a section of rows per week from Monday to Sunday; a week folds away, and one without a
 * programme says so, with the way to create it. The header box selects the rows shown that the reader may act on.
 */
export function ProgrammeWeekTable({
  weeks,
  showEmptyWeeks,
  canCreate,
  selected,
  onToggle,
  onToggleAll,
  currentWeek,
  timeZone,
  now,
}: ProgrammeWeekTableProps) {
  const [folded, setFolded] = useState<Record<string, boolean>>({})
  const shown = weeks.filter(week => week.items.length > 0 || showEmptyWeeks)
  const selectable = shown.flatMap(week => week.items.map(row => row.item)).filter(row => row.canEdit || row.canPublish)
  const selectionColumn = selectable.length > 0
  const allSelected = selectionColumn && selectable.every(row => selected.has(row.id))
  const someSelected = !allSelected && selectable.some(row => selected.has(row.id))
  const columns = selectionColumn ? 6 : 5
  const thisYear = dayOf(now, timeZone).slice(0, 4)

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm" aria-label={m.programs_table_label()}>
        <thead className={WIDE_ONLY}>
          <tr>
            {selectionColumn && (
              <th className={cn(HEAD, 'w-9 pr-0')}>
                <Checkbox
                  aria-label={m.programs_select_all()}
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={() =>
                    onToggleAll(
                      selectable.map(row => row.id),
                      !allSelected,
                    )
                  }
                />
              </th>
            )}
            <th className={HEAD}>{m.programs_table_programme()}</th>
            <th className={cn(HEAD, 'text-right')}>{m.programs_table_parts()}</th>
            <th className={cn(HEAD, 'text-right')}>{m.programs_table_services()}</th>
            <th className={HEAD}>{m.programs_table_status()}</th>
            <th className={HEAD}>{m.programs_table_review()}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(week => {
            const first = startOfDay(week.monday, timeZone)
            const date = formatEventDate(first, timeZone, getLocale(), {
              day: 'numeric',
              month: 'long',
              ...(week.monday.startsWith(thisYear) ? {} : { year: 'numeric' }),
            })
            const label = m.programs_week_of({ date })
            if (week.items.length === 0) {
              return (
                <EmptyWeek
                  key={week.monday}
                  monday={week.monday}
                  label={label}
                  date={date}
                  columns={columns}
                  canCreate={canCreate}
                />
              )
            }

            const open = !folded[week.monday]
            const rows = week.items.map(row => row.item)
            const review = rows.reduce((total, row) => total + row.review, 0)
            // Red as soon as one published programme of the week has someone away on the day of their part.
            const urgent = rows.some(row => row.review > 0 && row.status !== EventStatus.Draft)
            return (
              <Fragment key={week.monday}>
                <tr>
                  <td colSpan={columns} className="h-9 border-border border-b bg-sidebar px-3 py-0">
                    <div className="flex items-center gap-2 text-sm">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setFolded(prev => ({ ...prev, [week.monday]: open }))}
                        className="inline-flex h-9 items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ChevronRight
                          aria-hidden="true"
                          className={cn(
                            'size-4 shrink-0 text-faint transition-transform duration-(--u-duration-fast) motion-reduce:transition-none',
                            open && 'rotate-90',
                          )}
                        />
                        <span className="font-semibold">{label}</span>
                      </button>
                      {week.monday === currentWeek && (
                        <span className="font-medium text-brand-text text-xs">{m.programs_this_week()}</span>
                      )}
                      <span className="text-faint tabular-nums">
                        {rows.length > 1
                          ? m.programs_count_other({ count: rows.length })
                          : m.programs_count_one({ count: rows.length })}
                      </span>
                      <span className="flex-1" />
                      {review > 0 && (
                        <Status tone={urgent ? 'danger' : 'warning'}>
                          {review > 1
                            ? m.programs_absences_week_review_other({ count: review })
                            : m.programs_absences_week_review_one({ count: review })}
                        </Status>
                      )}
                    </div>
                  </td>
                </tr>
                {open &&
                  rows.map(row => (
                    <ProgrammeRow
                      key={row.id}
                      programme={row}
                      selectionColumn={selectionColumn}
                      selected={selected.has(row.id)}
                      onToggle={onToggle}
                      timeZone={timeZone}
                    />
                  ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EmptyWeek({
  monday,
  label,
  date,
  columns,
  canCreate,
}: {
  /** The week's Monday: « Créer » opens the creation page on that week. */
  monday: string
  label: string
  date: string
  columns: number
  canCreate: boolean
}) {
  return (
    <tr>
      <td colSpan={columns} className="h-9 border-border border-b bg-sidebar py-0 pr-3.5 pl-9 text-sm max-md:pl-4">
        <div className="flex items-center gap-2">
          {/* One line on a phone too: the week and « Créer » stay, the empty note gives way. */}
          <span className="shrink-0 whitespace-nowrap font-medium text-muted-foreground">{label}</span>
          <span className="min-w-0 truncate text-faint">· {m.programs_week_empty()}</span>
          <span className="flex-1" />
          {canCreate && (
            <Link
              to={`/programs/new?week=${monday}`}
              aria-label={m.programs_week_create_aria({ date })}
              className="font-medium text-brand-text underline-offset-4 hover:underline"
            >
              {m.programs_week_create()}
            </Link>
          )}
        </div>
      </td>
    </tr>
  )
}
