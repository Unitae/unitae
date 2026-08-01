import { z } from 'zod'

const rate = z.coerce.number().int().min(0).max(999)

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
