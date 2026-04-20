import { z } from 'zod'

export const createBuildingSchema = z.object({
  number: z.string().min(1),
  street: z.string().min(1),
  zip: z.string().min(1),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
})

export const updateBuildingSchema = z.object({
  number: z.string().min(1),
  street: z.string().min(1),
  zip: z.string().min(1),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
})

export const buildingNotesSchema = z.object({
  notes: z.string(),
})

export const splitToolCreateSchema = z.object({
  type: z.string().min(1),
  entranceIds: z.string().min(1),
})

export type CreateBuildingInput = z.infer<typeof createBuildingSchema>
export type UpdateBuildingInput = z.infer<typeof updateBuildingSchema>
export type BuildingNotesInput = z.infer<typeof buildingNotesSchema>
export type SplitToolCreateInput = z.infer<typeof splitToolCreateSchema>
