import { z } from 'zod'

// A count a person typed: a whole number of people, or null to clear it. Absent means « not touched »: a field
// someone left alone is never sent, so it is never written.
const count = z.number().int().min(0).max(100_000).nullable().optional()

export const attendanceRecordSchema = z.object({
  eventId: z.number().int().positive(),
  inPerson: count,
  online: count,
})

export type AttendanceRecordPayload = z.infer<typeof attendanceRecordSchema>
