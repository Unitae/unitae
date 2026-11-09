import { Panel, Status } from '@unitae/ui'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'

import type { ProgrammeAbsence } from '~/features/events/model/programme-absence.type'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { dayOf, startOfDay } from '~/shared/utils/calendar-day'
import { formatEventDate } from '~/shared/utils/event-time'
import { cn } from '~/shared/utils/utils'
import { ProgrammeAbsenceRow } from './ProgrammeAbsenceRow'
import { conflictsInWeek, type PeriodWeek } from './period-weeks'

interface AbsenceWeekListProps {
  weeks: PeriodWeek<ProgrammeAbsence>[]
  /** Show the weeks nobody is away; left out while a search or « À revoir » narrows the list. */
  showEmptyWeeks: boolean
  /** The Monday of this week, `YYYY-MM-DD`. */
  currentWeek: string
  timeZone: string
  now: Date
}

/** One list, a section per week from Monday to Sunday; a week can fold away, and one nobody is away says so. */
export function AbsenceWeekList({ weeks, showEmptyWeeks, currentWeek, timeZone, now }: AbsenceWeekListProps) {
  const [folded, setFolded] = useState<Record<string, boolean>>({})
  const shown = weeks.filter(week => week.items.length > 0 || showEmptyWeeks)
  const thisYear = dayOf(now, timeZone).slice(0, 4)

  return (
    <Panel aria-label={m.programs_absences_list_label()}>
      {shown.map(week => {
        const first = startOfDay(week.monday, timeZone)
        const date = formatEventDate(first, timeZone, getLocale(), {
          day: 'numeric',
          month: 'long',
          ...(week.monday.startsWith(thisYear) ? {} : { year: 'numeric' }),
        })
        const label = m.programs_absences_week_of({ date })
        const current = week.monday === currentWeek

        if (week.items.length === 0) {
          return (
            <div
              key={week.monday}
              className="flex h-9 items-center gap-2 border-border border-b bg-sidebar pr-4 pl-10 text-faint text-sm last:border-b-0"
            >
              <span className="font-medium text-muted-foreground">{label}</span>
              <span>· {m.programs_absences_week_nobody()}</span>
            </div>
          )
        }

        const open = !folded[week.monday]
        const weekConflicts = week.items.flatMap(row => conflictsInWeek(row.item.conflicts, week.monday, timeZone))
        const review = weekConflicts.length
        const listId = `absences-${week.monday}`
        return (
          <section key={week.monday} aria-label={label} className="border-border border-b last:border-b-0">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setFolded(prev => ({ ...prev, [week.monday]: open }))}
              className={cn(
                'flex min-h-9 w-full items-center gap-2 bg-sidebar py-1.5 pr-4 pl-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                open && 'border-border border-b',
              )}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  'size-4 shrink-0 text-faint transition-transform duration-(--u-duration-fast) motion-reduce:transition-none',
                  open && 'rotate-90',
                )}
              />
              <span className="font-semibold">{label}</span>
              {current && (
                <span className="font-medium text-brand-text text-xs">{m.programs_absences_this_week()}</span>
              )}
              <span className="text-faint tabular-nums">
                {week.items.length > 1
                  ? m.programs_absences_week_count_other({ count: week.items.length })
                  : m.programs_absences_week_count_one({ count: week.items.length })}
              </span>
              <span className="flex-1" />
              {review > 0 && (
                <Status tone={weekConflicts.some(conflict => conflict.published) ? 'danger' : 'warning'}>
                  {review > 1
                    ? m.programs_absences_week_review_other({ count: review })
                    : m.programs_absences_week_review_one({ count: review })}
                </Status>
              )}
            </button>
            {open && (
              <ul id={listId}>
                {week.items.map(({ item: absence, continued }) => (
                  <ProgrammeAbsenceRow
                    key={absence.id}
                    absence={absence}
                    conflicts={conflictsInWeek(absence.conflicts, week.monday, timeZone)}
                    continued={continued}
                    underway={current && new Date(absence.startDate) <= now && now <= new Date(absence.endDate)}
                    timeZone={timeZone}
                    now={now}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </Panel>
  )
}
