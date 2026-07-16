import { describe, expect, it } from 'vitest'
import { BULK_EVENT_IDS_MAX, bulkEventIdsSchema } from './bulk-event-ids.schema'

describe('bulkEventIdsSchema', () => {
  it('accepts a small list of positive integers', () => {
    const parsed = bulkEventIdsSchema.safeParse({ ids: [1, 2, 3] })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.ids).toEqual([1, 2, 3])
  })

  it('rejects an empty array', () => {
    const parsed = bulkEventIdsSchema.safeParse({ ids: [] })
    expect(parsed.success).toBe(false)
  })

  it('rejects missing ids field', () => {
    const parsed = bulkEventIdsSchema.safeParse({})
    expect(parsed.success).toBe(false)
  })

  it('rejects a non-array value', () => {
    const parsed = bulkEventIdsSchema.safeParse({ ids: 'nope' })
    expect(parsed.success).toBe(false)
  })

  // A caller cannot force a giant IN clause that would OOM the query planner.
  it('rejects arrays larger than the max cap', () => {
    const oversized = Array.from({ length: BULK_EVENT_IDS_MAX + 1 }, (_, i) => i + 1)
    const parsed = bulkEventIdsSchema.safeParse({ ids: oversized })
    expect(parsed.success).toBe(false)
  })

  it('accepts arrays at exactly the max cap', () => {
    const maxed = Array.from({ length: BULK_EVENT_IDS_MAX }, (_, i) => i + 1)
    const parsed = bulkEventIdsSchema.safeParse({ ids: maxed })
    expect(parsed.success).toBe(true)
  })

  // Element checks: negatives, zero, floats, strings must all be rejected —
  // event ids are positive integers. A mixed array coming from a malformed
  // client should fail loudly, not silently no-op.
  it('rejects non-integer elements', () => {
    expect(bulkEventIdsSchema.safeParse({ ids: [1.5] }).success).toBe(false)
    expect(bulkEventIdsSchema.safeParse({ ids: ['1'] }).success).toBe(false)
    expect(bulkEventIdsSchema.safeParse({ ids: [null] }).success).toBe(false)
  })

  it('rejects zero and negative ids', () => {
    expect(bulkEventIdsSchema.safeParse({ ids: [0] }).success).toBe(false)
    expect(bulkEventIdsSchema.safeParse({ ids: [-1] }).success).toBe(false)
  })
})
