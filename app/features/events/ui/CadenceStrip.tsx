import type { CadenceEntry } from '~/features/events/model/cadence.type'
import * as m from '~/i18n/paraglide/messages'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/shared/ui/tooltip'
import { formatAbsoluteDate } from '~/shared/utils/relative-time'
import { cn } from '~/shared/utils/utils'

type CadenceStripProps = {
  past: CadenceEntry[]
  future: CadenceEntry[]
}

export function CadenceStrip({ past, future }: CadenceStripProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-1.5">
        {past.map(entry => (
          <Dot key={`past-${entry.date}`} entry={entry} tone="past" />
        ))}
        <CurrentSlotMarker />
        {future.map(entry => (
          <Dot key={`future-${entry.date}`} entry={entry} tone="future" />
        ))}
      </div>
    </TooltipProvider>
  )
}

function CurrentSlotMarker() {
  const label = m.publisher_info_cadence_current_marker()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="mx-1 size-3 shrink-0 cursor-default rounded-full border-2 border-foreground/60 bg-transparent p-0"
        />
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
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={tooltip}
          className={cn(
            'size-2.5 shrink-0 cursor-default rounded-full border bg-transparent p-0',
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
