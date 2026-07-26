import { z } from 'zod'
import { BREACHED_PASSWORD_CHECK_SCOPES, CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { isValidTimezone } from '~/shared/utils/event-time'

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

// Congregation columns written by `updateGeneralSettings`.
export const generalSettingsSchema = z.object({
  displayName: z.string().optional().or(z.literal('')),
  locale: z.enum(['fr', 'en']),
  timezone: z.string().refine(isValidTimezone, 'Fuseau horaire invalide'),
  domain: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform(v => v?.trim().toLowerCase() || null)
    .pipe(z.string().regex(DOMAIN_REGEX, 'Nom de domaine invalide').nullable()),
})

export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>

// Form schema for the « Général » page: the columns above + password security, which is an
// instance-level setting stored as a Setting (see password-security.server.ts).
export const generalPageSchema = generalSettingsSchema.extend({
  [CongregationSettingKey.BreachedPasswordCheckScope]: z.enum(BREACHED_PASSWORD_CHECK_SCOPES).default('off'),
})
