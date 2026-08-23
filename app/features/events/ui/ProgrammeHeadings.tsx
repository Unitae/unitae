import { Clock, Users } from 'lucide-react'

import { sectionColor, sectionIcon } from '~/features/events/model/section-style'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

interface SectionHeadingProps {
  section: string
  /** Planned minutes of the whole section — the number a reviewer checks. */
  durationMin?: number | null
  className?: string
}

/**
 * The one way a programme section announces itself, on every surface: the
 * workbook color accent, its icon, the label, and the section's total
 * duration. Wrap in a TableRow/TableCell or a div as the surface requires.
 */
export function SectionHeading({ section, durationMin, className }: SectionHeadingProps) {
  const Icon = sectionIcon(section)
  const color = sectionColor(section)

  return (
    <span
      className={cn(
        'flex items-center gap-2 border-l-[3px] pl-2 font-medium text-xs uppercase tracking-wide',
        className,
      )}
      style={{ borderLeftColor: color }}
    >
      {Icon && <Icon aria-hidden="true" className="size-3.5" style={{ color }} />}
      <span style={{ color }}>{section}</span>
      {durationMin != null && (
        <span className="flex items-center gap-1 font-normal text-muted-foreground normal-case tracking-normal">
          · <Clock aria-hidden="true" className="size-3" />
          {m.programme_section_total_min({ minutes: String(durationMin) })}
        </span>
      )}
    </span>
  )
}

interface TrackHeadingProps {
  track: string
  /** Number of parts running in this parallel schedule. */
  count?: number
  className?: string
}

/** A parallel schedule (room/group) inside a section, with its part count. */
export function TrackHeading({ track, count, className }: TrackHeadingProps) {
  return (
    <span className={cn('flex items-center gap-1.5 pl-4 text-muted-foreground text-xs italic', className)}>
      <Users aria-hidden="true" className="size-3" />
      {track}
      {count != null && count > 0 && (
        <span className="not-italic">
          · {count === 1 ? m.programme_track_parts_one() : m.programme_track_parts_other({ count: String(count) })}
        </span>
      )}
    </span>
  )
}
