import { describe, expect, it } from 'vitest'
import type { Entrance } from '~/shared/types/entrance'
import { aggregateEntrance } from './buildings.server'

describe('aggregateEntrance', () => {
  it('names an entrance after its buildings and counts nothing unknown', () => {
    const entrance = {
      notes: 'Code 1234',
      homes: 12,
      phones: null,
      liberals: null,
      buildings: [
        { street: 'Rue de Paris', zip: '93260', number: '1' },
        { street: 'Rue de Paris', zip: '93260', number: '3' },
      ],
    } as unknown as Entrance

    expect(aggregateEntrance(entrance)).toMatchObject({
      street: 'Rue de Paris',
      zip: '93260',
      number: '1, 3',
      homes: 12,
      phones: 0,
      liberals: 0,
      entranceNotes: 'Code 1234',
    })
  })
})
