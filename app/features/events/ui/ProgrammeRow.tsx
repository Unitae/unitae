import { ProgressBar, Status } from '@unitae/ui'
import { Link } from 'react-router'

import { EventStatus } from '~/features/events/model/event-status.type'
import type { ProgrammeRowData } from '~/features/events/model/programme-list.type'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Checkbox } from '~/shared/ui/checkbox'
import { DateChip } from '~/shared/ui/DateChip'
import { openRowOnClick } from '~/shared/ui/row-click'
import { formatEventDate, formatEventTime } from '~/shared/utils/event-time'
import { cn } from '~/shared/utils/utils'

export const PROGRAMME_CELL = 'h-14 whitespace-nowrap border-border border-b px-3.5'
/** Columns past the programme's own are for wide screens; a phone reads the facts under its name. */
export const WIDE_ONLY = 'max-md:hidden'

interface ProgrammeRowProps {
  programme: ProgrammeRowData
  /** The table has a selection column; this row has a box in it when the reader may act on it. */
  selectionColumn: boolean
  selected: boolean
  onToggle: (id: number) => void
  timeZone: string
}

/** « jeu. 12 nov. · 19:00 », the time left out when the programme has none. */
function when(programme: ProgrammeRowData, timeZone: string): string {
  const day = formatEventDate(programme.startDate, timeZone, getLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const time = formatEventTime(programme.startDate, timeZone)
  return time === '00:00' ? day : `${day} · ${time}`
}

/**
 * One programme: its day, its name and kind, its parts and services filled, its state, and the people away on the day
 * of their part — red once it is published and people rely on it, orange while it is a draft. The row opens it.
 */
export function ProgrammeRow({ programme, selectionColumn, selected, onToggle, timeZone }: ProgrammeRowProps) {
  const draft = programme.status === EventStatus.Draft
  const date = when(programme, timeZone)
  const selectable = programme.canEdit || programme.canPublish

  return (
    <tr
      onClick={openRowOnClick}
      className={cn(
        'group relative cursor-pointer transition-colors duration-(--u-duration-fast)',
        selected ? 'bg-selected' : 'hover:bg-hover',
      )}
    >
      {selectionColumn && (
        <td className={cn(PROGRAMME_CELL, WIDE_ONLY, 'relative z-10 w-9 pr-0')}>
          {selectable && (
            <Checkbox
              aria-label={m.programs_select_one({ name: programme.name, date })}
              checked={selected}
              onCheckedChange={() => onToggle(programme.id)}
            />
          )}
        </td>
      )}
      <td className={cn(PROGRAMME_CELL, 'max-md:h-auto max-md:whitespace-normal max-md:py-3')}>
        <Link
          to={`/programs/events/${programme.id}`}
          data-row-primary
          className="flex items-center gap-3 outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring max-md:items-start"
        >
          <DateChip date={programme.startDate} timeZone={timeZone} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium">{programme.name}</span>
            <span className="flex items-center gap-1.5 text-faint text-sm">
              <span className="tabular-nums">{date}</span>
              {programme.kind && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: programme.kind.color }}
                  />
                  <span className="truncate">{programme.kind.name}</span>
                </>
              )}
            </span>
            <PhoneFacts programme={programme} draft={draft} />
          </span>
        </Link>
      </td>
      <td className={cn(PROGRAMME_CELL, WIDE_ONLY, 'text-right')}>
        <Fill counts={programme.parts} />
      </td>
      <td className={cn(PROGRAMME_CELL, WIDE_ONLY, 'text-right')}>
        <Fill counts={programme.services} />
      </td>
      <td className={cn(PROGRAMME_CELL, WIDE_ONLY)}>
        <State draft={draft} />
      </td>
      <td className={cn(PROGRAMME_CELL, WIDE_ONLY)}>
        <Review count={programme.review} draft={draft} />
      </td>
    </tr>
  )
}

function Fill({ counts }: { counts: { total: number; filled: number } }) {
  if (counts.total === 0) return <span className="text-faint">—</span>
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <ProgressBar value={counts.filled} max={counts.total} className="w-14" />
      <span
        className={cn(
          'min-w-9 text-right tabular-nums',
          counts.filled < counts.total ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {counts.filled}/{counts.total}
      </span>
    </span>
  )
}

function State({ draft }: { draft: boolean }) {
  return draft ? (
    <Status tone="warning">{m.programs_event_draft_badge()}</Status>
  ) : (
    <Status tone="success">{m.programs_view_released()}</Status>
  )
}

function Review({ count, draft }: { count: number; draft: boolean }) {
  if (count === 0) return null
  return (
    <Status tone={draft ? 'warning' : 'danger'}>
      {count > 1 ? m.programs_absent_other({ count }) : m.programs_absent_one({ count })}
    </Status>
  )
}

/** On a phone, the facts of the wide columns under the name. */
function PhoneFacts({ programme, draft }: { programme: ProgrammeRowData; draft: boolean }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-sm md:hidden">
      <State draft={draft} />
      {programme.parts.total > 0 && (
        <span className="tabular-nums">
          {m.programs_parts_short({ filled: programme.parts.filled, total: programme.parts.total })}
        </span>
      )}
      {programme.services.total > 0 && (
        <span className="tabular-nums">
          {m.programs_services_short({ filled: programme.services.filled, total: programme.services.total })}
        </span>
      )}
      <Review count={programme.review} draft={draft} />
    </span>
  )
}
