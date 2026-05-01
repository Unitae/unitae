import { z } from 'zod'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

export const createTerritorySchema = z.object({
  number: z.string().min(1),
  type: z.nativeEnum(TerritoryKind),
  entrances: z
    .array(z.coerce.number())
    .or(z.coerce.number().transform(v => [v]))
    .optional()
    .default([]),
})

export const updateTerritorySchema = z.object({
  entrances: z
    .array(z.coerce.number())
    .or(z.coerce.number().transform(v => [v]))
    .optional()
    .default([]),
  reassignments: z
    .array(
      z.object({
        entranceId: z.coerce.number().int().positive(),
        fromTerritoryId: z.coerce.number().int().positive(),
      }),
    )
    .optional()
    .default([]),
  notes: z.string().optional().default(''),
})

export type CreateTerritoryInput = z.infer<typeof createTerritorySchema>
export type UpdateTerritoryInput = z.infer<typeof updateTerritorySchema>
