import { Status, Tag } from '@unitae/ui'
import { Link } from 'react-router'

import { absenceDays, absenceLength, formatAbsencePeriod } from '~/features/events/model/absence'
import type { ProgrammeAbsence, ProgrammeAbsenceConflict } from '~/features/events/model/programme-absence.type'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { DateChip } from '~/shared/ui/DateChip'
import { formatEventDate } from '~/shared/utils/event-time'

interface ProgrammeAbsenceRowProps {
  absence: ProgrammeAbsence
  /** The assignments falling in the week this row sits under. */
  conflicts: ProgrammeAbsenceConflict[]
  /** It began before the week this row sits under. */
  continued: boolean
  underway: boolean
  timeZone: string
  now: Date
}

/**
 * Someone's absence under one week: the row of « Mes absences » with the person's name, when it was declared (after
 * the programme was made, or before), and the assignments falling that week with the way to reassign them.
 */
export function ProgrammeAbsenceRow({
  absence,
  conflicts,
  continued,
  underway,
  timeZone,
  now,
}: ProgrammeAbsenceRowProps) {
  const locale = getLocale()
  const { count } = absenceDays(absence.startDate, absence.endDate, timeZone)
  const declared = formatEventDate(absence.declaredAt, timeZone, locale, { day: 'numeric', month: 'short' })

  return (
    <li className="flex items-start gap-3.5 border-border border-b py-3 pr-3 pl-3.5 transition-colors duration-(--u-duration-fast) last:border-b-0 hover:bg-hover md:pr-4 md:pl-4">
      <DateChip date={absence.startDate} timeZone={timeZone} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {absence.recordHref ? (
            <Link to={absence.recordHref} className="font-medium underline-offset-4 hover:underline">
              {absence.name}
            </Link>
          ) : (
            <span className="font-medium">{absence.name}</span>
          )}
          {underway && <Tag tone="brand">{m.days_off_underway()}</Tag>}
          {continued && <Tag>{m.programs_absences_continued()}</Tag>}
        </div>
        <span className="text-muted-foreground text-sm">
          {formatAbsencePeriod(absence.startDate, absence.endDate, timeZone, now)}{' '}
          <span className="text-faint tabular-nums">· {absenceLength(count)}</span>
        </span>
        {conflicts.length > 0 && <Conflicts conflicts={conflicts} timeZone={timeZone} />}
        <span className="text-faint text-xs sm:hidden">{m.programs_absences_declared({ date: declared })}</span>
      </div>
      <span className="shrink-0 pt-1 text-faint text-xs max-sm:hidden">
        {m.programs_absences_declared({ date: declared })}
      </span>
    </li>
  )
}

function Conflicts({ conflicts, timeZone }: { conflicts: ProgrammeAbsenceConflict[]; timeZone: string }) {
  const locale = getLocale()
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {/* Red once a programme is published and people rely on it; orange while they all are drafts. */}
      <Status
        tone={conflicts.some(conflict => conflict.published) ? 'danger' : 'warning'}
        className="whitespace-normal text-foreground"
      >
        {m.days_off_conflicts({ count: conflicts.length })}
      </Status>
      <ul className="flex flex-col gap-1 pl-[1.125rem] text-muted-foreground text-sm">
        {conflicts.map(conflict => {
          const date = formatEventDate(conflict.eventDate, timeZone, locale, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })
          return (
            <li key={conflict.key} className="flex flex-wrap items-center gap-x-2.5">
              <span>
                <span className="font-medium text-foreground">{conflict.name}</span> · {date}
              </span>
              {conflict.href && (
                <Link
                  to={conflict.href}
                  className="font-medium text-brand-text underline-offset-4 hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center"
                  aria-label={
                    conflict.action === 'reassign'
                      ? m.programs_absences_reassign_aria({ part: conflict.name, date })
                      : m.programs_absences_view_programme_aria({ date })
                  }
                >
                  {conflict.action === 'reassign'
                    ? m.programs_absences_reassign()
                    : m.programs_absences_view_programme()}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
