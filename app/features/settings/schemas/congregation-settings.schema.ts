import { z } from 'zod'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'

export const congregationSettingsSchema = z.object({
  displayName: z.string().optional().or(z.literal('')),
  [CongregationSettingKey.AuxiliaryPioneerProfileActivated]: z
    .string()
    .optional()
    .transform(v => String(Boolean(v))),
})

export type CongregationSettingsInput = z.infer<typeof congregationSettingsSchema>
