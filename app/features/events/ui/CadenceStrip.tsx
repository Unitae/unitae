import type { CadenceEntry } from '~/features/events/model/cadence.type'
import { formatAbsoluteDate } from '~/shared/utils/relative-time'
import { cn } from '~/shared/utils/utils'

type CadenceStripProps = {
  past: CadenceEntry[]
  future: CadenceEntry[]
}

export function CadenceStrip({ past, future }: CadenceStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {past.map(entry => (
        <Dot key={`past-${entry.date}`} entry={entry} tone="past" />
      ))}
      <span aria-hidden className="mx-1 h-3 w-px shrink-0 bg-muted-foreground/40" title="Maintenant" />
      {future.map(entry => (
        <Dot key={`future-${entry.date}`} entry={entry} tone="future" />
      ))}
    </div>
  )
}

function Dot({ entry, tone }: { entry: CadenceEntry; tone: 'past' | 'future' }) {
  const filledPast = entry.assigned && tone === 'past'
  const filledFuture = entry.assigned && tone === 'future'
  return (
    <span
      title={formatAbsoluteDate(new Date(entry.date))}
      className={cn(
        'size-2.5 shrink-0 rounded-full border',
        filledPast && 'border-green-600 bg-green-600 dark:border-green-400 dark:bg-green-400',
        filledFuture && 'border-green-600 bg-green-500/30 dark:border-green-400',
        !entry.assigned && 'border-muted-foreground/40 bg-transparent',
      )}
    />
  )
}
