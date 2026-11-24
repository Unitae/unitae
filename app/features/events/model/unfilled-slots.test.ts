import { describe, expect, it } from 'vitest'
import { unfilledSlots } from './unfilled-slots'

describe('unfilledSlots', () => {
  it('counts a part without its speaker, and a reader slot its preset asks for that nobody holds', () => {
    expect(
      unfilledSlots({
        parts: [
          { assigneeId: null, externalSpeakerId: null, assistantId: null, preset: null },
          { assigneeId: 1, externalSpeakerId: null, assistantId: null, preset: { hasReaderSlot: true } },
          { assigneeId: null, externalSpeakerId: 7, assistantId: null, preset: null },
          { assigneeId: 2, externalSpeakerId: null, assistantId: 3, preset: { hasReaderSlot: true } },
        ],
        services: [],
      }),
    ).toEqual({ programme: 2, duty: 0 })
  })

  it('counts a service nobody holds', () => {
    expect(unfilledSlots({ parts: [], services: [{ assigneeId: null }, { assigneeId: 4 }] })).toEqual({
      programme: 0,
      duty: 1,
    })
  })
})
