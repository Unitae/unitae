import { z } from 'zod'

// Postgres tops out around 65k parameters per query and Prisma builds
// IN clauses positionally. 500 is a generous cap for a UI selection while
// staying well below any planner limit; the cap is enforced at the route
// boundary so a malformed client cannot force a huge IN.
export const BULK_EVENT_IDS_MAX = 500

export const bulkEventIdsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(BULK_EVENT_IDS_MAX),
})

export type BulkEventIdsPayload = z.infer<typeof bulkEventIdsSchema>
