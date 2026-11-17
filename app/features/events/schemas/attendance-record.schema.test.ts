import { describe, expect, it } from 'vitest'
import { attendanceRecordSchema } from './attendance-record.schema'

describe('attendanceRecordSchema', () => {
  it('keeps a count left out apart from a count cleared', () => {
    const parsed = attendanceRecordSchema.parse({ eventId: 4, online: null })

    expect('inPerson' in parsed).toBe(false)
    expect(parsed.online).toBeNull()
  })

  it('refuses a count that is not a whole number of people', () => {
    expect(attendanceRecordSchema.safeParse({ eventId: 4, inPerson: -2 }).success).toBe(false)
    expect(attendanceRecordSchema.safeParse({ eventId: 4, inPerson: 9.5 }).success).toBe(false)
  })
})
