import { describe, expect, it } from 'vitest'
import type { BulkPublishPreview } from './bulk-publish-preview.type'
import { bulkPublishSummary } from './bulk-publish-summary'

const empty: BulkPublishPreview = {
  publish: [],
  notYours: [],
  conflicts: [],
  empty: [],
  awaiting: [],
  events: { publish: [], awaiting: [], notYours: [] },
}
const day = new Date('2027-03-03T18:00:00Z')
const schedule = (id: number, eventId: number) => ({
  id,
  eventId,
  name: null,
  kind: 'duty' as const,
  eventName: 'R',
  startDate: day,
})
const meeting = (id: number) => ({ id, name: 'R', startDate: day })

describe('bulkPublishSummary, what the bulk dialog counts and publishes', () => {
  it.each([
    ['nothing', empty, { publish: 0, held: 0, eventIds: [] }],
    [
      'two schedules of one meeting, one held back',
      {
        ...empty,
        publish: [
          { ...schedule(1, 10), unfilled: 0 },
          { ...schedule(2, 10), unfilled: 3 },
        ],
        empty: [schedule(3, 11)],
      },
      { publish: 2, held: 1, eventIds: [10] },
    ],
    [
      'a bare meeting publishes as a whole; one awaiting its programme is held',
      { ...empty, events: { publish: [meeting(20)], awaiting: [meeting(21)], notYours: [meeting(22)] } },
      { publish: 1, held: 2, eventIds: [20] },
    ],
    [
      'every reason to stay a draft counts once',
      {
        ...empty,
        notYours: [{ ...schedule(4, 12), responsible: null }],
        conflicts: [{ ...schedule(5, 12), away: ['Lecture'] }],
        awaiting: [schedule(6, 13)],
      },
      { publish: 0, held: 3, eventIds: [] },
    ],
  ])('%s', (_name, preview, summary) => {
    expect(bulkPublishSummary(preview as BulkPublishPreview)).toEqual(summary)
  })
})
