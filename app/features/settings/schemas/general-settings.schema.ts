import { z } from 'zod'

export const generalSettingsSchema = z.object({
  displayName: z.string().optional().or(z.literal('')),
  locale: z.enum(['fr', 'en']),
  domain: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform(v => v || null),
})

export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>
