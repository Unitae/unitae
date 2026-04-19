import { z } from 'zod/v4'

export const createTerritorySchema = z.object({
  number: z.string().min(1),
  type: z.string(),
  entrances: z.array(z.coerce.number()).or(z.coerce.number().transform(v => [v])).optional().default([]),
})

export const updateTerritorySchema = z.object({
  entrances: z.array(z.coerce.number()).or(z.coerce.number().transform(v => [v])).optional().default([]),
  notes: z.string().optional().default(''),
})

export type CreateTerritoryInput = z.infer<typeof createTerritorySchema>
export type UpdateTerritoryInput = z.infer<typeof updateTerritorySchema>
