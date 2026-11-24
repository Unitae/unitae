import { describe, expect, it } from 'vitest'
import { readItem } from './use-schedule-template-page'

describe('readItem', () => {
  it('reads an existing part or service, and a new one', () => {
    expect(readItem('part-12')).toEqual({ kind: 'part', id: 12 })
    expect(readItem('service-7')).toEqual({ kind: 'service', id: 7 })
    expect(readItem('new-part')).toEqual({ kind: 'part', id: null })
  })

  it('opens nothing for what is not an item', () => {
    for (const value of [null, '', 'part-', 'part-abc', 'event-3', 'new-thing', 'part-12x']) {
      expect(readItem(value)).toBeNull()
    }
  })
})
