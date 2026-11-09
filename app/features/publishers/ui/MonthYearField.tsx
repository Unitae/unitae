import * as m from '~/i18n/paraglide/messages'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

import { monthName } from './enrolment-labels'

const MONTHS = Array.from({ length: 12 }, (_, index) => index)

export interface MonthRef {
  month: number
  year: number
}

const ONGOING = '__ongoing__'

interface MonthYearFieldProps {
  id: string
  label: string
  /** The form fields the month and the year post as; empty while ongoing. */
  names: { month: string; year: string }
  value: MonthRef | null
  onChange: (value: MonthRef | null) => void
  years: number[]
  /** Offer « En cours » first: no last month, the stint runs on. */
  ongoing?: boolean
}

/** A calendar month as a month and a year, both posted as numbers (the month 0-indexed). */
export function MonthYearField({ id, label, names, value, onChange, years, ongoing = false }: MonthYearFieldProps) {
  const fallbackYear = value?.year ?? years[years.length - 1] ?? new Date().getFullYear()
  // A stint older than the offered years keeps its own year in the list.
  const yearChoices = value != null && !years.includes(value.year) ? [value.year, ...years] : years
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <input type="hidden" name={names.month} value={value?.month ?? ''} />
      <input type="hidden" name={names.year} value={value?.year ?? ''} />
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
        <Select
          value={value == null ? ONGOING : String(value.month)}
          onValueChange={next => onChange(next === ONGOING ? null : { month: Number(next), year: fallbackYear })}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ongoing && <SelectItem value={ONGOING}>{m.publishers_record_enrolment_ongoing()}</SelectItem>}
            {MONTHS.map(month => (
              <SelectItem key={month} value={String(month)}>
                {monthName(month)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={value == null ? '' : String(value.year)}
          disabled={value == null}
          onValueChange={next => value != null && onChange({ month: value.month, year: Number(next) })}
        >
          <SelectTrigger className="w-full" aria-label={m.publishers_record_enrolment_year({ label })}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {yearChoices.map(year => (
              <SelectItem key={year} value={String(year)}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
