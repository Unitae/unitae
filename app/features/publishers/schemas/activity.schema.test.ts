import { describe, expect, it } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'
import { updateActivitySchema } from './activity.schema'

// The credit's tri-state rides on this mapping: an absent or emptied field must come out as
// `undefined` (the action then decides between "leave untouched" and "clear"), never as the
// 0 that z.coerce.number would make of an empty string.

const BASE = { type: PublisherType.PionnierPermanant, hours: '30', studies: '0', observations: '' }

describe('updateActivitySchema — creditHours', () => {
  it('maps an emptied field to undefined, not zero', () => {
    const result = updateActivitySchema.safeParse({ ...BASE, creditHours: '' })

    expect(result.success).toBe(true)
    expect(result.success && result.data.creditHours).toBeUndefined()
  })

  it('stays undefined when the field is absent', () => {
    const result = updateActivitySchema.safeParse(BASE)

    expect(result.success).toBe(true)
    expect(result.success && result.data.creditHours).toBeUndefined()
  })

  it('coerces a filled field to its number', () => {
    const result = updateActivitySchema.safeParse({ ...BASE, creditHours: '25' })

    expect(result.success && result.data.creditHours).toBe(25)
  })

  it('refuses a negative credit', () => {
    const result = updateActivitySchema.safeParse({ ...BASE, creditHours: '-5' })

    expect(result.success).toBe(false)
  })
})
