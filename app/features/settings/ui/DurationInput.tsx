import { useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { cn } from '~/shared/utils/utils'

/** « 2 semaines », « ≈ 4 mois » beside a number of days; nothing under a week, where the days say it all. */
export function dayReadout(days: number): string | null {
  if (!Number.isFinite(days) || days < 7) return null
  if (days < 28) {
    const weeks = Math.round(days / 7)
    return weeks === 1 ? m.settings_duration_weeks_one() : m.settings_duration_weeks_many({ count: String(weeks) })
  }
  return m.settings_duration_months({ count: String(Math.round(days / 30)) })
}

/** « 2 ans » beside a whole number of years in months. */
export function monthReadout(months: number): string | null {
  if (!Number.isFinite(months) || months < 12 || months % 12 !== 0) return null
  const years = months / 12
  return years === 1 ? m.settings_duration_years_one() : m.settings_duration_years_many({ count: String(years) })
}

interface DurationInputProps {
  id: string
  name: string
  /** Names the field for assistive technologies when its label sits elsewhere in the row. */
  label: string
  defaultValue: number
  unit: 'days' | 'months'
  max: number
  error?: string
  /** For the unit and its readout, e.g. a fixed width so the fields of a list line up. */
  unitClassName?: string
}

/** A number of days or months, with what it amounts to beside it (« jours · ≈ 4 mois »). */
export function DurationInput({ id, name, label, defaultValue, unit, max, error, unitClassName }: DurationInputProps) {
  const [value, setValue] = useState(defaultValue)
  const readout = unit === 'days' ? dayReadout(value) : monthReadout(value)

  return (
    <span className="flex items-center gap-2">
      <Input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        defaultValue={defaultValue}
        onChange={event => setValue(Number(event.target.value))}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-20 text-right tabular-nums"
      />
      <span className={cn('text-muted-foreground text-sm', unitClassName)}>
        {unit === 'days'
          ? m.settings_territories_attribution_duration_days_unit()
          : m.settings_territories_months_unit()}
        {readout && <span className="text-faint"> · {readout}</span>}
      </span>
    </span>
  )
}
