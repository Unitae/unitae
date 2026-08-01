import { z } from 'zod'

// min(1): a pioneer goal of 0 h is meaningless, and it also rejects a blank field
// (coerced to 0). max(999) is a loose sanity cap (defaults top out at 100).
const rate = z.coerce.number().int().min(1).max(999)

// One monthly rate per pioneer type for a given service year. Field names map to
// PublisherType in the action.
export const pioneerGoalsSchema = z.object({
  serviceYear: z.coerce.number().int().min(2000),
  permanent: rate,
  auxiliary: rate,
  special: rate,
  missionary: rate,
})

export type PioneerGoalsInput = z.infer<typeof pioneerGoalsSchema>
