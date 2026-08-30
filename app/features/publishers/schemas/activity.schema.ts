import { z } from 'zod'
import { PublisherType } from '~/shared/types/publisher-type'

export const createActivitySchema = z.object({
  publisher: z.coerce.number(),
  month: z.coerce.number().min(0).max(11),
  year: z.coerce.number().min(2022),
  type: z.nativeEnum(PublisherType).optional(),
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
  type: z.nativeEnum(PublisherType),
  hours: z.coerce.number().min(0).optional().default(0),
  studies: z.coerce.number().min(0).optional().default(0),
  observations: z.string().optional().default(''),
  preached: z
    .string()
    .optional()
    .transform(v => v === 'on'),
  // Secretary-only hour credit; the action only forwards it for CanCorrectActivity holders.
  // No default, and '' maps to undefined: an emptied field clears the credit (the action turns
  // undefined into null for secretaries), while a non-secretary submit leaves it untouched.
  creditHours: z.preprocess(v => (v === '' || v == null ? undefined : v), z.coerce.number().min(0).optional()),
})

export type CreateActivityInput = z.infer<typeof createActivitySchema>
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>
