import { CalendarDays, Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { type ListPeriod, PERIOD_PRESETS, type PeriodPreset, presetEnd } from '~/features/events/model/list-period'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { DateInput } from '~/shared/ui/DateInput'
import { Label } from '~/shared/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '~/shared/ui/popover'
import { cn } from '~/shared/utils/utils'

const PRESET_LABELS: Record<PeriodPreset, () => string> = {
  '4-weeks': m.list_period_preset_4_weeks,
  'next-month': m.list_period_preset_next_month,
  '3-months': m.list_period_preset_3_months,
}

// Node's and the browser's ICU space a range differently: the server's text must match the client's.
const SPACES = /\s+/g

/** Days written `YYYY-MM-DD` are calendar days already: read them at noon UTC, then format them in UTC. */
const noon = (day: string) => new Date(`${day}T12:00:00Z`)

/** « 9 nov. », a `YYYY-MM-DD` day. */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat(getLocale(), { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(noon(day))
}

/** « 9 nov. – 31 déc. 2026 ». */
export function formatDays(period: ListPeriod): string {
  return new Intl.DateTimeFormat(getLocale(), { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })
    .formatRange(noon(period.from), noon(period.to))
    .replace(SPACES, ' ')
}

interface PeriodMenuProps {
  period: ListPeriod
  preset: PeriodPreset | null
  /** `YYYY-MM-DD` in the congregation's zone. */
  today: string
}

/**
 * The period on the title's row: three choices starting today, or two days picked by hand. A choice applies at once,
 * with no « Filtrer » button; a preset also closes the menu, the days stay open for the second one.
 */
export function PeriodMenu({ period, preset, today }: PeriodMenuProps) {
  const [, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const apply = (next: Record<string, string | null>) =>
    setParams(
      prev => {
        for (const [name, value] of Object.entries(next)) {
          if (value == null) prev.delete(name)
          else prev.set(name, value)
        }
        return prev
      },
      { preventScrollReset: true },
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={m.list_period_aria({ period: formatDays(period) })}>
          <CalendarDays aria-hidden="true" className="text-faint" />
          <span className="tabular-nums">{formatDays(period)}</span>
          <ChevronDown aria-hidden="true" className="text-faint" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1.5">
        <fieldset className="flex flex-col gap-0.5">
          <legend className="sr-only">{m.list_period_label()}</legend>
          {PERIOD_PRESETS.map(choice => (
            <button
              key={choice}
              type="button"
              aria-pressed={preset === choice}
              // The default needs no address of its own.
              onClick={() => {
                apply({ period: choice === 'next-month' ? null : choice, from: null, to: null })
                setOpen(false)
              }}
              className={cn(
                'flex h-9 items-center gap-2 rounded-sm px-2.5 text-left text-sm outline-none transition-colors duration-(--u-duration-fast) hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring',
                preset === choice && 'bg-selected',
              )}
            >
              <Check aria-hidden="true" className={cn('size-4 text-brand', preset !== choice && 'invisible')} />
              {PRESET_LABELS[choice]()}
              <span className="ml-auto text-faint tabular-nums">{formatDay(presetEnd(choice, today))}</span>
            </button>
          ))}
        </fieldset>
        <div className="my-1.5 h-px bg-border" />
        <div key={`${period.from}-${period.to}`} className="grid grid-cols-2 gap-2 px-1 pt-1 pb-1.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="period-from">{m.list_period_from()}</Label>
            <DateInput
              id="period-from"
              defaultValue={period.from}
              onChange={from => from && apply({ period: null, from, to: period.to })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="period-to">{m.list_period_to()}</Label>
            <DateInput
              id="period-to"
              defaultValue={period.to}
              onChange={to => to && apply({ period: null, from: period.from, to })}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
