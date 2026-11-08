import { Users } from 'lucide-react'
import { summarizeDurations } from '~/features/events/model/programme-grouping'
import { sectionColor } from '~/features/events/model/section-style'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

/** Revealed on hover and keyboard focus, always there on touch screens where nothing hovers. */
export const ROW_REVEAL =
  'opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100'

/** « 24 min · 2 sans durée »: the known minutes, and the parts they leave out. */
export function durationLabel({ minutes, missing }: { minutes: number; missing: number }, total = false) {
  const known = total
    ? m.programs_edit_programme_minutes({ count: String(minutes) })
    : m.programme_section_total_min({ minutes: String(minutes) })
  return [
    ...(minutes > 0 ? [known] : []),
    ...(missing > 0 ? [m.programs_edit_missing_durations({ count: String(missing) })] : []),
  ].join(' · ')
}

/** A programme section as a row of a panel: the workbook colour, the name and its honest total. */
export function ProgrammeSectionHead({
  section,
  parts,
  className,
}: {
  section: string
  parts: { durationMin?: number | null }[]
  className?: string
}) {
  return (
    <h3
      className={cn(
        'flex h-9 items-center gap-2 border-border border-b bg-sidebar px-4.5 font-semibold text-sm',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="h-3.5 w-[3px] flex-none rounded-sm"
        style={{ background: sectionColor(section) }}
      />
      {section}
      <span className="font-normal text-faint tabular-nums">· {durationLabel(summarizeDurations(parts))}</span>
    </h3>
  )
}

/** A room or group running in parallel inside a section, with its number of parts. */
export function ProgrammeTrackHead({ track, count, className }: { track: string; count: number; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-7.5 items-center gap-2 border-border border-b pr-4.5 pl-11 text-muted-foreground text-sm',
        className,
      )}
    >
      <Users aria-hidden="true" className="size-3.5" />
      <span className="font-medium text-foreground">{track}</span>
      <span className="text-faint">
        · {count === 1 ? m.programme_track_parts_one() : m.programme_track_parts_other({ count: String(count) })}
      </span>
    </div>
  )
}
