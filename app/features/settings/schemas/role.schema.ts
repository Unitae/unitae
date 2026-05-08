import { z } from 'zod'

const permissionKeysField = z
  .array(z.string())
  .or(z.string().transform(v => [v]))
  .optional()
  .default([])

export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().default(''),
  permissionKeys: permissionKeysField,
})

export const editRoleSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional().default(''),
  permissionKeys: permissionKeysField,
})

export type CreateRoleInput = z.infer<typeof createRoleSchema>
export type EditRoleInput = z.infer<typeof editRoleSchema>
