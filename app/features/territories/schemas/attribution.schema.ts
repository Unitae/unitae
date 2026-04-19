import { z } from 'zod'

export const createAttributionSchema = z.object({
  territory: z.coerce.number(),
  publisher: z.coerce.number(),
  'start-date': z.string().min(1),
  notes: z.string().optional().default(''),
  type: z.string(),
})

export type CreateAttributionInput = z.infer<typeof createAttributionSchema>
