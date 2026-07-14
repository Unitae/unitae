import { describe, expect, it } from 'vitest'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { filterDynamicDataToEvent } from './programme-event-filter.server'

const PROGRAMME_DATA = {
  type: DynamicType.Programme,
  events: [
    { id: 100, name: 'Meeting A', partAssignments: [], serviceRoleAssignments: [] },
    { id: 200, name: 'Meeting B', partAssignments: [], serviceRoleAssignments: [] },
    { id: 300, name: 'Meeting C', partAssignments: [], serviceRoleAssignments: [] },
  ],
  config: null,
  templateKey: null,
  showServices: false,
}

describe('filterDynamicDataToEvent', () => {
  it('returns the data untouched when eventId is null', () => {
    const result = filterDynamicDataToEvent(PROGRAMME_DATA as never, null)
    expect(result).toBe(PROGRAMME_DATA)
  })

  it('narrows events to the matching one when the id is present in the list', () => {
    const result = filterDynamicDataToEvent(PROGRAMME_DATA as never, 200) as typeof PROGRAMME_DATA
    expect(result.events).toHaveLength(1)
    expect(result.events[0].id).toBe(200)
  })

  it('leaves the full list untouched when the id is not present (past event / different template)', () => {
    const result = filterDynamicDataToEvent(PROGRAMME_DATA as never, 999)
    expect(result).toBe(PROGRAMME_DATA)
  })

  it('returns the data untouched for non-Programme dynamic types', () => {
    const pioneers = { type: DynamicType.Pioneers, pioneers: [] }
    const result = filterDynamicDataToEvent(pioneers as never, 100)
    expect(result).toBe(pioneers)
  })

  it('returns null when the input is null', () => {
    const result = filterDynamicDataToEvent(null, 100)
    expect(result).toBeNull()
  })
})
