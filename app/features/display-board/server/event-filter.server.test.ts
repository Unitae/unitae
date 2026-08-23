import { describe, expect, it } from 'vitest'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { filterDynamicDataToEvent } from './event-filter.server'

const PROGRAMME_DATA = {
  type: DynamicType.Programme,
  events: [
    { id: 100, name: 'Meeting A', parts: [], serviceParts: [] },
    { id: 200, name: 'Meeting B', parts: [], serviceParts: [] },
    { id: 300, name: 'Meeting C', parts: [], serviceParts: [] },
  ],
  config: null,
  templateKey: null,
  showServices: false,
}

describe('filterDynamicDataToEvent', () => {
  it('returns the data untouched when eventId is null', () => {
    const result = filterDynamicDataToEvent(PROGRAMME_DATA as never, null)
    expect(result.data).toBe(PROGRAMME_DATA)
    // Nothing was asked for, so nothing is missing.
    expect(result.requestedEventMissing).toBe(false)
  })

  it('narrows events to the matching one when the id is present in the list', () => {
    const result = filterDynamicDataToEvent(PROGRAMME_DATA as never, 200)
    const data = result.data as typeof PROGRAMME_DATA
    expect(data.events).toHaveLength(1)
    expect(data.events[0]?.id).toBe(200)
    expect(result.requestedEventMissing).toBe(false)
  })

  it('says so when the requested event is not in this document', () => {
    // Silently rendering the whole programme leaves the reader hunting a list
    // for something that is not in it. The viewer needs to be able to say why.
    const result = filterDynamicDataToEvent(PROGRAMME_DATA as never, 999)
    expect(result.data).toBe(PROGRAMME_DATA)
    expect(result.requestedEventMissing).toBe(true)
  })

  it('does not claim a miss on a document that has no events at all', () => {
    const empty = { type: DynamicType.Programme, events: [] }
    const result = filterDynamicDataToEvent(empty as never, 999)
    expect(result.requestedEventMissing).toBe(true)
  })

  it('returns the data untouched for non-Programme dynamic types', () => {
    const pioneers = { type: DynamicType.Pioneers, pioneers: [] }
    const result = filterDynamicDataToEvent(pioneers as never, 100)
    expect(result.data).toBe(pioneers)
    expect(result.requestedEventMissing).toBe(false)
  })

  it('returns null when the input is null', () => {
    const result = filterDynamicDataToEvent(null, 100)
    expect(result.data).toBeNull()
    expect(result.requestedEventMissing).toBe(false)
  })
})
