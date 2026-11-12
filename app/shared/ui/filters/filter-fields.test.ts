import { describe, expect, it } from 'vitest'

import { activeFilterChips, activeFilterCount, type FilterField, toggledValues } from './filter-fields'

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

describe('a field taking several choices', () => {
  const groups: FilterField = {
    param: 'group',
    label: 'Groupe',
    allLabel: 'Tous les groupes',
    multiple: true,
    options: [
      { value: '7', label: 'Nord' },
      { value: '8', label: 'Sud' },
      { value: 'none', label: 'Sans groupe' },
    ],
  }

  it('gives one chip naming every choice, in the order of the options, and counts as one filter', () => {
    const params = new URLSearchParams('group=none&group=7&group=99')
    expect(activeFilterChips([groups], params)).toEqual([{ key: 'group', label: 'Groupe', value: 'Nord, Sans groupe' }])
    expect(activeFilterCount([groups], params)).toBe(1)
  })

  it('adds a choice not yet made and removes one already made', () => {
    expect(toggledValues(['7'], '8')).toEqual(['7', '8'])
    expect(toggledValues(['7', '8'], '7')).toEqual(['8'])
  })
})
