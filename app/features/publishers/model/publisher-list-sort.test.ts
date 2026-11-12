import { describe, expect, it } from 'vitest'

import { publisherSortOptions } from './publisher-list-filters'
import { sortPublisherRows } from './publisher-list-sort'

const row = (lastname: string, firstname: string, group: string | null) => ({
  lastname,
  firstname,
  group: group == null ? null : { id: 0, name: group },
})

describe('publisherSortOptions', () => {
  it('offers name and group on the active and inactive lists, departure and name on those who left', () => {
    expect(publisherSortOptions('active')).toEqual(['name', 'group'])
    expect(publisherSortOptions('inactive')).toEqual(['name', 'group'])
    expect(publisherSortOptions('left')).toEqual(['departure', 'name'])
  })
})

describe('sortPublisherRows', () => {
  const rows = [
    row('Petit', 'Luc', 'Groupe 10'),
    row('Martin', 'Élodie', null),
    row('André', 'Frédéric', 'Groupe 2'),
    row('Bernard', 'Sylvie', 'Groupe 10'),
  ]

  it('groups them by group, in the order a reader counts, then by name, those in no group last', () => {
    expect(sortPublisherRows(rows, 'group', 'fr').map(r => r.lastname)).toEqual(['André', 'Bernard', 'Petit', 'Martin'])
  })

  it('keeps the order the server gave for the other choices', () => {
    expect(sortPublisherRows(rows, 'name', 'fr')).toBe(rows)
    expect(sortPublisherRows(rows, 'departure', 'fr')).toBe(rows)
  })
})
