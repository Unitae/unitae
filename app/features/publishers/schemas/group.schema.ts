import { z } from 'zod'

export const createGroupSchema = z.object({
  name: z.string().min(1),
  address: z.string(),
  responsible: z.coerce.number(),
  deputy: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' ? Number(v) : undefined))
    .pipe(z.number().optional()),
})

export const updateGroupSchema = createGroupSchema

export type CreateGroupInput = z.infer<typeof createGroupSchema>
