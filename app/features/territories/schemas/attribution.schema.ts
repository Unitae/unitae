import { z } from 'zod'

export const createAttributionSchema = z.object({
  territory: z.coerce.number(),
  publisher: z.coerce.number(),
  'start-date': z.string().min(1),
  notes: z.string().optional().default(''),
  type: z.string(),
})

export const updateAttributionSchema = z.object({
  publisher: z.coerce.number(),
  'start-date': z.string().min(1),
  'late-date': z.string().optional().default(''),
  'end-date': z.string().optional().default(''),
  notes: z.string().optional().default(''),
  type: z.string(),
})

export type CreateAttributionInput = z.infer<typeof createAttributionSchema>
export type UpdateAttributionInput = z.infer<typeof updateAttributionSchema>
