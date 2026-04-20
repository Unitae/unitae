import { z } from 'zod'

export const createActivitySchema = z.object({
  publisher: z.coerce.number(),
  month: z.coerce.number().min(0).max(11),
  year: z.coerce.number().min(2022),
  type: z.string().optional(),
  hours: z.coerce.number().min(0).optional().default(0),
  studies: z.coerce.number().min(0).optional().default(0),
  observations: z.string().optional().default(''),
  preached: z
    .string()
    .optional()
    .transform(v => v === 'on'),
  previousPage: z.string().optional().default(''),
})

export const updateActivitySchema = z.object({
  type: z.string(),
  hours: z.coerce.number().min(0).optional().default(0),
  studies: z.coerce.number().min(0).optional().default(0),
  observations: z.string().optional().default(''),
  preached: z
    .string()
    .optional()
    .transform(v => v === 'on'),
})

export type CreateActivityInput = z.infer<typeof createActivitySchema>
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>
