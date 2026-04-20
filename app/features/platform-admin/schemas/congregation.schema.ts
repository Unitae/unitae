import { z } from 'zod'

export const editCongregationSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  domain: z
    .string()
    .optional()
    .default('')
    .transform(v => v || null),
  displayName: z
    .string()
    .optional()
    .default('')
    .transform(v => v || null),
  active: z
    .string()
    .optional()
    .transform(v => v === 'on'),
})

export type EditCongregationInput = z.infer<typeof editCongregationSchema>
