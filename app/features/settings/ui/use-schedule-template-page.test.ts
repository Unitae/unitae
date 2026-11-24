import { describe, expect, it } from 'vitest'
import { readItem } from './use-schedule-template-page'

const read = (search: string) => readItem(new URLSearchParams(search))

describe('readItem', () => {
  it('reads an existing part or service, and a new one', () => {
    expect(read('item=part-12')).toEqual({ kind: 'part', id: 12 })
    expect(read('item=service-7')).toEqual({ kind: 'service', id: 7 })
    expect(read('item=new-service')).toEqual({ kind: 'service', id: null, draft: undefined })
  })

  it('reads a new part’s starting point: its section, hall and place', () => {
    expect(read('item=new-part&section=Joyaux&hall=Salle+B&hallOrder=2&order=11')).toEqual({
      kind: 'part',
      id: null,
      draft: { section: 'Joyaux', track: 'Salle B', trackOrder: 2, order: 11 },
    })
    expect(read('item=new-part&section=&hall=&order=4')?.draft).toEqual({
      section: '',
      track: '',
      trackOrder: null,
      order: 4,
    })
  })

  it('opens nothing for what is not an item', () => {
    for (const search of ['', 'item=part-', 'item=part-abc', 'item=event-3', 'item=new-thing', 'item=part-12x']) {
      expect(read(search)).toBeNull()
    }
  })
})
