import { z } from 'zod'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'

export const createAttributionSchema = z.object({
  territory: z.coerce.number(),
  publisher: z.coerce.number(),
  'start-date': z.string().min(1),
  notes: z.string().optional().default(''),
  type: z.nativeEnum(TerritoryAttributionKind),
})

export const updateAttributionSchema = z.object({
  publisher: z.coerce.number(),
  'start-date': z.string().min(1),
  'late-date': z.string().optional().default(''),
  'end-date': z.string().optional().default(''),
  notes: z.string().optional().default(''),
  type: z.nativeEnum(TerritoryAttributionKind),
})

export type CreateAttributionInput = z.infer<typeof createAttributionSchema>
export type UpdateAttributionInput = z.infer<typeof updateAttributionSchema>
