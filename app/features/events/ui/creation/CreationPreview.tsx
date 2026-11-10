import { DateChip, Panel } from '@unitae/ui'
import { Link } from 'react-router'

import { byWeek, type PlannedProgramme } from '~/features/events/model/programme-creation'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Checkbox } from '~/shared/ui/checkbox'
import { isCalendarDay } from '~/shared/utils/calendar-day'
import { formatDay } from '~/shared/utils/format-day'
import { cn } from '~/shared/utils/utils'

import { chipDay, chipMonth, monthName, programmesCount, restLabel, shortDate } from './creation-labels'
import type { ProgrammeCreationState } from './use-programme-creation'

/** What the series will create, week by week like the list: what exists stays, an unticked day is passed. */
export function SeriesPreview({ state, today }: { state: ProgrammeCreationState; today: string }) {
  const { count, planned } = state
  const further = state.ends.find(end => end > state.to)

  return (
    <Panel title={m.programs_new_preview_title()}>
      <div className="flex flex-col gap-0.5 border-border border-b px-4 py-3">
        <p className="font-semibold text-base tabular-nums" aria-live="polite">
          {programmesCount(count.create)}
        </p>
        {planned.length > 0 && (
          <p className="text-faint text-sm tabular-nums">{restLabel(count.existing, count.skipped)}</p>
        )}
      </div>
      {planned.length === 0 ? (
        <p className="px-4 py-3 text-muted-foreground text-sm">{m.programs_new_tick_meeting()}</p>
      ) : (
        <div className="max-h-[max(16rem,calc(100dvh-26rem))] overflow-y-auto">
          {/* Short enough for the panel to end above the save bar while it stays in view. */}
          {byWeek(planned).map(week => (
            <WeekRows key={week.monday} monday={week.monday} rows={week.rows} state={state} today={today} />
          ))}
        </div>
      )}
      {count.create === 0 && planned.length > 0 && (
        <div className="flex flex-col items-start gap-2 border-border border-t px-4 py-3">
          <p className="text-muted-foreground text-sm">{m.programs_new_nothing_left()}</p>
          {further != null && (
            <Button type="button" variant="outline" size="sm" onClick={() => state.setTo(further)}>
              {m.programs_new_go_further({ month: monthName(further) })}
            </Button>
          )}
        </div>
      )}
      {planned.length > 0 && (
        <p className="border-border border-t px-4 py-2.5 text-faint text-sm">{m.programs_new_skip_hint()}</p>
      )}
    </Panel>
  )
}

function WeekRows({
  monday,
  rows,
  state,
  today,
}: {
  monday: string
  rows: PlannedProgramme[]
  state: ProgrammeCreationState
  today: string
}) {
  const label = m.programs_week_of({
    date: formatDay(monday, {
      day: 'numeric',
      month: 'long',
      ...(monday.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
    }),
  })
  return (
    <>
      <p className="flex h-8 items-center border-border border-b bg-sidebar px-4 font-medium text-sm">{label}</p>
      <ul aria-label={label}>
        {rows.map(row => (
          <PreviewRow
            key={row.key}
            row={row}
            passed={state.skipped.has(row.key)}
            onToggle={() => state.toggleSkip(row.key)}
          />
        ))}
      </ul>
    </>
  )
}

function PreviewRow({ row, passed, onToggle }: { row: PlannedProgramme; passed: boolean; onToggle: () => void }) {
  const date = shortDate(row.day)
  const content = (
    <>
      <DateChip
        month={chipMonth(row.day)}
        day={chipDay(row.day)}
        className={cn(row.existingId != null && 'opacity-55')}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate font-medium text-sm', passed && 'text-faint line-through')}>
          {row.template.name}
        </span>
        <span className="flex items-center gap-1.5 text-faint text-xs tabular-nums">
          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: row.template.color }} />
          {date} · {row.template.startTime}
        </span>
      </span>
    </>
  )
  const rowClass = 'flex min-h-12 items-center gap-2.5 border-border border-b px-4 py-1.5 last:border-b-0'

  if (row.existingId != null) {
    return (
      <li className={rowClass}>
        <span className="size-4 shrink-0" />
        {content}
        <Link
          to={`/programs/events/${row.existingId}`}
          className="shrink-0 text-faint text-xs underline-offset-4 hover:underline"
        >
          {m.programs_new_row_exists()}
        </Link>
      </li>
    )
  }
  const id = `creation-row-${row.key}`
  return (
    <li>
      <label htmlFor={id} className={cn(rowClass, 'cursor-pointer hover:bg-hover')}>
        <Checkbox
          id={id}
          checked={!passed}
          onCheckedChange={onToggle}
          aria-label={m.programs_new_row_create({ name: row.template.name, date })}
        />
        {content}
        {passed && <span className="shrink-0 text-faint text-xs">{m.programs_new_row_skipped()}</span>}
      </label>
    </li>
  )
}

/** The one programme « Une seule date » will create, and where the page goes next. */
export function SinglePreview({ state }: { state: ProgrammeCreationState }) {
  const freeform = state.choice === 'freeform'
  const template = state.template
  const name = freeform ? state.name.trim() || m.programs_new_freeform_name() : template?.name
  const day = isCalendarDay(state.day) ? state.day : null

  return (
    <Panel title={m.programs_new_preview_title()}>
      {name == null ? (
        <p className="px-4 py-3 text-muted-foreground text-sm">{m.programs_new_pick_template()}</p>
      ) : (
        <>
          <p className="border-border border-b px-4 py-3 font-semibold text-base">{programmesCount(1)}</p>
          <div className="flex min-h-12 items-center gap-2.5 border-border border-b px-4 py-1.5">
            {day != null && <DateChip month={chipMonth(day)} day={chipDay(day)} />}
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-sm">{name}</span>
              {day != null && (
                <span className="text-faint text-xs tabular-nums">
                  {shortDate(day)}
                  {template != null && ` · ${template.startTime}`}
                </span>
              )}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 px-4 py-3 text-muted-foreground text-sm">
            <p>{freeform ? m.programs_new_freeform_empty() : m.programs_new_from_template()}</p>
            <p>{m.programs_new_then_edit()}</p>
          </div>
        </>
      )}
    </Panel>
  )
}
