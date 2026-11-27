import { describe, expect, it } from 'vitest'
import { unfilledSlots, unfilledToPublish } from './unfilled-slots'

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

describe('unfilledToPublish', () => {
  it('counts the slots of the drafts « Tout publier » would publish, each schedule its own, nothing of the others', () => {
    // Two duties schedules beside the programme, each with its own slots.
    const unfilled = new Map([
      [1, 5],
      [2, 3],
      [3, 2],
    ])
    const of = (schedule: { id: number }) => unfilled.get(schedule.id) ?? 0
    expect(
      unfilledToPublish(
        [
          { id: 1, publishable: true },
          { id: 2, publishable: true },
          { id: 3, publishable: true },
        ],
        of,
      ),
    ).toBe(10)
    // Someone else's draft, or a published schedule, is not publishable here: it adds nothing.
    expect(
      unfilledToPublish(
        [
          { id: 1, publishable: false },
          { id: 2, publishable: true },
          { id: 3, publishable: false },
        ],
        of,
      ),
    ).toBe(3)
  })
})
