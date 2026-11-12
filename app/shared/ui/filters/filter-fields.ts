import type { FilterChip } from './FilterChipBar'

/** One filter of a list, kept in the address under `param`: « all » when absent. */
export interface FilterField {
  param: string
  label: string
  /** The choice that sets no filter, e.g. « Tous les groupes ». */
  allLabel: string
  options: { value: string; label: string }[]
  /** Several choices at once (`?group=7&group=8`), ticked in a list rather than picked one. */
  multiple?: boolean
}

/** The options of a field the address holds, in the field's own order. A value no option knows filters nothing. */
export function chosenOptions(field: FilterField, params: URLSearchParams): FilterField['options'] {
  const values = field.multiple ? params.getAll(field.param) : [params.get(field.param)]
  return field.options.filter(option => values.includes(option.value)).slice(0, field.multiple ? undefined : 1)
}

/** A chip per field set to one of its options: « Groupe : Nord », or « Groupe : Nord, Sud » for several. */
export function activeFilterChips(fields: readonly FilterField[], params: URLSearchParams): FilterChip[] {
  return fields.flatMap(field => {
    const chosen = chosenOptions(field, params)
    return chosen.length === 0
      ? []
      : [{ key: field.param, label: field.label, value: chosen.map(option => option.label).join(', ') }]
  })
}

export function activeFilterCount(fields: readonly FilterField[], params: URLSearchParams): number {
  return activeFilterChips(fields, params).length
}

/** The choices of a several-choice field once `value` is ticked or unticked. */
export function toggledValues(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter(v => v !== value) : [...values, value]
}
