import { z } from 'zod'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'

export const congregationSettingsSchema = z.object({
  [CongregationSettingKey.PermanentAuxiliaryPioneerProfileActivated]: z
    .string()
    .optional()
    .transform(v => String(Boolean(v))),
})

export type CongregationSettingsInput = z.infer<typeof congregationSettingsSchema>
