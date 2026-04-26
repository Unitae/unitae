import { z } from 'zod'

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

export const generalSettingsSchema = z.object({
  displayName: z.string().optional().or(z.literal('')),
  locale: z.enum(['fr', 'en']),
  domain: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform(v => v?.trim().toLowerCase() || null)
    .pipe(z.string().regex(DOMAIN_REGEX, 'Nom de domaine invalide').nullable()),
})

export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>
