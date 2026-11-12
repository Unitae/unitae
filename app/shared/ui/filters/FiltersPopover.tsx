import { SegmentedControl } from '@unitae/ui'
import { ListFilter } from 'lucide-react'
import { useSearchParams } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Checkbox } from '~/shared/ui/checkbox'
import { Label } from '~/shared/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '~/shared/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

import { activeFilterCount, chosenOptions, type FilterField, toggledValues } from './filter-fields'

/** No option can take it: the value of « all ». */
const ALL = '\u0000all'

/** Up to three choices, « all » included, read best side by side; more go in a list. */
const SEGMENTED_MAX = 3

/**
 * A list's filters behind one « Filtres » button, which says how many are on. Each field changes the address at
 * once; « Effacer » drops them all and keeps the rest (search, view, order). The active ones show as chips under the
 * toolbar (`FilterChipBar` with `clearParams`).
 */
export function FiltersPopover({ fields }: { fields: FilterField[] }) {
  const [params, setParams] = useSearchParams()
  const active = activeFilterCount(fields, params)

  const set = (param: string, value: string) =>
    setParams(
      prev => {
        if (value === ALL) prev.delete(param)
        else prev.set(param, value)
        prev.delete('page')
        return prev
      },
      { replace: true, preventScrollReset: true },
    )
  const toggle = (param: string, value: string) =>
    setParams(
      prev => {
        const next = toggledValues(prev.getAll(param), value)
        prev.delete(param)
        for (const v of next) prev.append(param, v)
        prev.delete('page')
        return prev
      },
      { replace: true, preventScrollReset: true },
    )
  const clear = () =>
    setParams(
      prev => {
        for (const field of fields) prev.delete(field.param)
        return prev
      },
      { replace: true, preventScrollReset: true },
    )

  if (fields.length === 0) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={active > 0 ? m.filters_button_active({ count: active }) : m.filters_button()}
        >
          <ListFilter className="text-muted-foreground" aria-hidden="true" />
          {m.filters_button()}
          {active > 0 && (
            <span className="rounded-full bg-foreground px-1.5 font-medium text-background text-xs tabular-nums">
              {active}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-3.5 p-3.5">
        {fields.map(field =>
          field.multiple ? (
            <ChoiceList key={field.param} field={field} params={params} onToggle={toggle} />
          ) : (
            <FieldControl key={field.param} field={field} value={params.get(field.param)} onChange={set} />
          ),
        )}
        <div className="flex items-center justify-between border-border border-t pt-2.5">
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={active === 0} className="-ml-2">
            {m.filters_clear()}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FilterField
  value: string | null
  onChange: (param: string, value: string) => void
}) {
  const known = field.options.some(option => option.value === value) ? (value as string) : ALL
  const id = `filter-${field.param}`

  if (field.options.length + 1 <= SEGMENTED_MAX) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-sm">{field.label}</span>
        <SegmentedControl
          aria-label={field.label}
          size="sm"
          value={known}
          onValueChange={next => onChange(field.param, next)}
          options={[{ value: ALL, label: field.allLabel }, ...field.options]}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      <Select value={known} onValueChange={next => onChange(field.param, next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{field.allLabel}</SelectItem>
          {field.options.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** A field taking several choices: each option ticked or not, none ticked meaning « all ». */
function ChoiceList({
  field,
  params,
  onToggle,
}: {
  field: FilterField
  params: URLSearchParams
  onToggle: (param: string, value: string) => void
}) {
  const chosen = new Set(chosenOptions(field, params).map(option => option.value))
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 font-medium text-sm">{field.label}</legend>
      <div className="flex max-h-56 flex-col overflow-y-auto">
        {field.options.map(option => {
          const id = `filter-${field.param}-${option.value}`
          return (
            <label
              key={option.value}
              htmlFor={id}
              className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm hover:bg-hover pointer-coarse:min-h-11"
            >
              <Checkbox
                id={id}
                checked={chosen.has(option.value)}
                onCheckedChange={() => onToggle(field.param, option.value)}
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
