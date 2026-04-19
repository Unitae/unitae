import { z } from 'zod/v4'

export const createGroupSchema = z.object({
  name: z.string().min(1),
  address: z.string(),
  responsible: z.coerce.number(),
  deputy: z.coerce.number().optional(),
})

export const updateGroupSchema = createGroupSchema

export type CreateGroupInput = z.infer<typeof createGroupSchema>
