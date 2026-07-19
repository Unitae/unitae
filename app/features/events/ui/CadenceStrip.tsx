import type { CadenceEntry } from '~/features/events/model/cadence.type'
import * as m from '~/i18n/paraglide/messages'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/shared/ui/tooltip'
import { formatAbsoluteDate } from '~/shared/utils/relative-time'
import { cn } from '~/shared/utils/utils'

type CadenceStripProps = {
  past: CadenceEntry[]
  future: CadenceEntry[]
  // When true, the picker has selected the person already saved on this slot
  // — the marker fills green (with its dark border kept) to confirm the
  // no-op selection visually.
  savedMatchesSelection?: boolean
}

export function CadenceStrip({ past, future, savedMatchesSelection = false }: CadenceStripProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-1.5">
        {past.map(entry => (
          <Dot key={`past-${entry.date}`} entry={entry} tone="past" />
        ))}
        <CurrentSlotMarker filled={savedMatchesSelection} />
        {future.map(entry => (
          <Dot key={`future-${entry.date}`} entry={entry} tone="future" />
        ))}
      </div>
    </TooltipProvider>
  )
}

// Timeline-playhead marker: a small filled triangle pointing down onto a
// slightly-larger-than-a-dot circle. Distinct geometry from the data dots
// so it reads as a cursor position, not another data point. The circle
// fills green (with its dark border kept) when the picker has selected the
// person already saved on this slot — a confirmation of the no-op pick.
function CurrentSlotMarker({ filled }: { filled: boolean }) {
  const label = m.publisher_info_cadence_current_marker()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="mx-1.5 flex shrink-0 cursor-default flex-col items-center border-0 bg-transparent p-0 text-foreground"
        >
          <svg width="6" height="4" viewBox="0 0 6 4" className="fill-current" aria-hidden="true">
            <polygon points="0,0 6,0 3,4" />
          </svg>
          <span
            className={cn(
              'mt-1 size-3.5 rounded-full border-2 border-foreground',
              filled && 'bg-green-600 dark:bg-green-400',
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Dot({ entry, tone }: { entry: CadenceEntry; tone: 'past' | 'future' }) {
  const filledPast = entry.assigned && tone === 'past'
  const filledFuture = entry.assigned && tone === 'future'
  const dateLabel = formatAbsoluteDate(new Date(entry.date))
  const tooltip = entry.personName ? `${entry.personName} — ${dateLabel}` : dateLabel
  // Draft future events are the picker's own scratch space — mark them dashed
  // so a solid green fill can't be misread as a hard commitment.
  const isDraftFuture = tone === 'future' && entry.status === 'draft'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={tooltip}
          className={cn(
            'size-2.5 shrink-0 mt-2 cursor-default rounded-full border bg-transparent p-0',
            isDraftFuture && 'border-dashed',
            filledPast && 'border-green-600 bg-green-600 dark:border-green-400 dark:bg-green-400',
            filledFuture && 'border-green-600 bg-green-500/30 dark:border-green-400',
            !entry.assigned && 'border-muted-foreground/40',
          )}
        />
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}
