import { z } from 'zod'

const roleIdsField = z.preprocess(
  v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]),
  z.array(z.coerce.number().int().positive()),
)

export const createSectionSchema = z.object({
  name: z.string().min(1),
  visibilityRoleIds: roleIdsField.default([]),
})

export const updateSectionSchema = z.object({
  name: z.string().min(1),
  visibilityRoleIds: roleIdsField.default([]),
})

export type CreateSectionInput = z.infer<typeof createSectionSchema>
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>
