import type { CadenceEntry } from '~/features/events/model/cadence.type'
import * as m from '~/i18n/paraglide/messages'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/shared/ui/tooltip'
import { formatAbsoluteDate } from '~/shared/utils/relative-time'
import { cn } from '~/shared/utils/utils'

interface RotationPanelProps {
  /** « Sur cette partie », « Sur ce service ». */
  label: string
  /** What the strip says in words: « 1 des 6 dernières fois · la dernière le 22 octobre ». */
  sentence: string
  past: CadenceEntry[]
  future: CadenceEntry[]
  /** The person picked is the one already saved on the slot: the current marker fills. */
  savedMatchesSelection: boolean
  timeZone: string
}

const monthOf = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone, month: 'short' }).format(new Date(iso))

/**
 * Who held the slot over the last and next occurrences, readable without hovering: a sentence, the strip with
 * this person's turns filled in the accent, and the months at both ends. Hovering a dot still names its person.
 */
export function RotationPanel({ label, sentence, past, future, savedMatchesSelection, timeZone }: RotationPanelProps) {
  const first = past[0] ?? future[0]
  const last = future.at(-1) ?? past.at(-1)
  return (
    <div className="flex flex-col gap-1.5 pt-0.5">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="text-faint">{sentence}</span>
      </p>
      {(past.length > 0 || future.length > 0) && (
        <TooltipProvider delayDuration={150}>
          <div className="flex w-fit flex-col gap-1">
            <div className="flex items-end gap-[7px]">
              {past.map(entry => (
                <Dot key={`past-${entry.date}`} entry={entry} future={false} />
              ))}
              <CurrentMarker filled={savedMatchesSelection} />
              {future.map(entry => (
                <Dot key={`future-${entry.date}`} entry={entry} future />
              ))}
            </div>
            {first && last && first !== last && (
              <div aria-hidden="true" className="flex justify-between text-[11px] text-faint">
                <span>{monthOf(first.date, timeZone)}</span>
                <span>{monthOf(last.date, timeZone)}</span>
              </div>
            )}
          </div>
        </TooltipProvider>
      )}
    </div>
  )
}

// A playhead rather than another dot: a caret over a ring, filled when the pick is the person already saved.
function CurrentMarker({ filled }: { filled: boolean }) {
  const label = m.publisher_info_cadence_current_marker()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="mx-[3px] flex shrink-0 cursor-default flex-col items-center gap-0.5 border-0 bg-transparent p-0 text-foreground"
        >
          <svg width="8" height="5" viewBox="0 0 8 5" className="fill-current" aria-hidden="true">
            <polygon points="0,0 8,0 4,5" />
          </svg>
          <span className={cn('size-3.5 rounded-full border-2 border-foreground', filled && 'bg-primary')} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Dot({ entry, future }: { entry: CadenceEntry; future: boolean }) {
  const date = formatAbsoluteDate(new Date(entry.date))
  const tooltip = entry.personName ? `${entry.personName} — ${date}` : date
  // A draft ahead is still the picker's scratch space: dashed, so it never reads as a commitment.
  const draft = future && entry.status === 'draft'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={tooltip}
          className={cn(
            'size-2.5 shrink-0 cursor-default rounded-full border-[1.5px] bg-transparent p-0',
            draft && 'border-dashed',
            entry.assigned ? 'border-primary' : 'border-muted-foreground/40',
            entry.assigned && (future ? 'bg-primary/35' : 'bg-primary'),
          )}
        />
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}
