import { describe, expect, it } from 'vitest'

import { activeFilterChips, activeFilterCount, type FilterField } from './filter-fields'

// A list's filters as fields kept in the address: the chips of the active ones, and how many are on.

const fields: FilterField[] = [
  {
    param: 'type',
    label: 'Mode',
    allLabel: 'Tous',
    options: [
      { value: 'Default', label: 'Porte à porte' },
      { value: 'Phone', label: 'Téléphone' },
    ],
  },
  { param: 'group', label: 'Groupe', allLabel: 'Tous les groupes', options: [{ value: '7', label: 'Nord' }] },
]

describe('activeFilterChips', () => {
  it('gives a chip per field set to one of its options, named by the field and the option', () => {
    expect(activeFilterChips(fields, new URLSearchParams('type=Phone&group=7&view=late'))).toEqual([
      { key: 'type', label: 'Mode', value: 'Téléphone' },
      { key: 'group', label: 'Groupe', value: 'Nord' },
    ])
  })

  it('ignores a value no option knows, as the list does', () => {
    expect(activeFilterChips(fields, new URLSearchParams('group=99'))).toEqual([])
    expect(activeFilterCount(fields, new URLSearchParams('group=99&type=Default'))).toBe(1)
  })
})
