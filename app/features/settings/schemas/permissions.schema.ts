import { z } from 'zod'

export const editPermissionsSchema = z.object({
  roleId: z.coerce.number().int().positive(),
  permissionKeys: z
    .array(z.string())
    .or(z.string().transform(v => [v]))
    .optional()
    .default([]),
})

export type EditPermissionsInput = z.infer<typeof editPermissionsSchema>
