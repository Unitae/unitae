import { describe, expect, it } from 'vitest'

import { groupByStreet, mainStreets, toHolderEntrance } from './holder-territory'

const building = (number: string, street = 'Rue Voltaire', zip = '69100', lat: number | null = 45.7) => ({
  number,
  street,
  zip,
  latitude: lat,
  longitude: lat == null ? null : 4.8,
})

const entrance = (id: number, buildings: ReturnType<typeof building>[], extra: Record<string, unknown> = {}) => ({
  id,
  homes: 10,
  phones: 2,
  access: null,
  accesses: [],
  isOpenEarly: null,
  isMailboxOpen: null,
  notes: '',
  shopKind: '',
  buildings,
  ...extra,
})

describe('toHolderEntrance', () => {
  it('names the entrance after its buildings, smallest number first', () => {
    const result = toHolderEntrance(entrance(1, [building('14'), building('12')]), 'fr')

    expect(result).toMatchObject({ street: 'Rue Voltaire', zip: '69100', numbers: ['12', '14'], homes: 10 })
  })

  it('keeps the morning and mailbox facts only behind a door code', () => {
    const withCode = toHolderEntrance(
      entrance(1, [building('3')], { accesses: [{ type: 4 }], isOpenEarly: true, isMailboxOpen: true }),
      'fr',
    )
    const withoutCode = toHolderEntrance(
      entrance(2, [building('5')], { accesses: [{ type: 1 }], isOpenEarly: true, isMailboxOpen: true }),
      'fr',
    )

    expect(withCode).toMatchObject({ openEarly: true, mailboxOpen: true })
    expect(withoutCode).toMatchObject({ openEarly: false, mailboxOpen: false })
  })

  it('places only the buildings that have coordinates', () => {
    const result = toHolderEntrance(entrance(1, [building('1'), building('3', 'Rue Voltaire', '69100', null)]), 'fr')

    expect(result?.points).toEqual([{ lat: 45.7, lng: 4.8, number: '1' }])
  })

  it('skips an entrance with no building left', () => {
    expect(toHolderEntrance(entrance(1, []), 'fr')).toBeNull()
  })
})

describe('groupByStreet', () => {
  const holder = (id: number, number: string, street: string, zip = '69100', homes = 10) => {
    const result = toHolderEntrance(entrance(id, [building(number, street, zip)], { homes }), 'fr')
    if (result == null) throw new Error('fixture')
    return result
  }

  it('groups entrances by street, in alphabetical order, numbers in walking order', () => {
    const groups = groupByStreet(
      [
        holder(1, '21', 'Rue Voltaire'),
        holder(2, '4', 'Allée des Peupliers'),
        holder(3, '10', 'Allée des Peupliers'),
        holder(4, '2bis', 'Allée des Peupliers'),
        holder(5, '12', 'Rue Voltaire'),
      ],
      'fr',
    )

    expect(groups.map(g => g.street)).toEqual(['Allée des Peupliers', 'Rue Voltaire'])
    expect(groups[0].entrances.map(e => e.numbers[0])).toEqual(['2bis', '4', '10'])
    expect(groups[1].entrances.map(e => e.numbers[0])).toEqual(['12', '21'])
  })

  it('keeps the same street name in two postcodes apart, and totals its households', () => {
    const groups = groupByStreet(
      [
        holder(1, '1', 'Rue de la Paix', '69100', 8),
        holder(2, '3', 'Rue de la Paix', '69100', 4),
        holder(3, '1', 'Rue de la Paix', '69200', 6),
      ],
      'fr',
    )

    expect(groups.map(g => [g.zip, g.homes])).toEqual([
      ['69100', 12],
      ['69200', 6],
    ])
  })
})

describe('mainStreets', () => {
  it('orders streets by how many entrances they hold, then by name', () => {
    expect(mainStreets(['Rue B', 'Rue A', 'Rue B', 'Rue C', 'Rue A', 'Rue B'], 'fr')).toEqual([
      'Rue B',
      'Rue A',
      'Rue C',
    ])
  })
})
