import type { FilterChip } from './FilterChipBar'

/** One filter of a list, kept in the address under `param`: « all » when absent. */
export interface FilterField {
  param: string
  label: string
  /** The choice that sets no filter, e.g. « Tous les groupes ». */
  allLabel: string
  options: { value: string; label: string }[]
}

/** A chip per field set to one of its options: « Groupe : Nord ». A value no option knows filters nothing. */
export function activeFilterChips(fields: readonly FilterField[], params: URLSearchParams): FilterChip[] {
  return fields.flatMap(field => {
    const option = field.options.find(o => o.value === params.get(field.param))
    return option == null ? [] : [{ key: field.param, label: field.label, value: option.label }]
  })
}

export function activeFilterCount(fields: readonly FilterField[], params: URLSearchParams): number {
  return activeFilterChips(fields, params).length
}
