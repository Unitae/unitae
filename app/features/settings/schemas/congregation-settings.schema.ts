import { z } from 'zod'
import { BREACHED_PASSWORD_CHECK_SCOPES, CongregationSettingKey } from '~/shared/types/congregation-setting-key'

export const congregationSettingsSchema = z.object({
  [CongregationSettingKey.AuxiliaryPioneerProfileActivated]: z
    .string()
    .optional()
    .transform(v => String(Boolean(v))),
  [CongregationSettingKey.BreachedPasswordCheckScope]: z.enum(BREACHED_PASSWORD_CHECK_SCOPES).default('off'),
})

export type CongregationSettingsInput = z.infer<typeof congregationSettingsSchema>
