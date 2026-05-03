import { z } from 'zod'

export const territorySettingsSchema = z.object({
  zips: z.string().default(''),
  'bano-url': z.string().default(''),
  'prospection-validity': z.string().default(''),
  'phone-territory-active': z
    .string()
    .optional()
    .transform(v => v === 'on' || v === 'true'),
  'map-tab-active': z
    .string()
    .optional()
    .transform(v => v === 'on' || v === 'true'),
  'attribution-default-duration': z.string().default('120'),
  'attribution-campaign-duration': z.string().default('60'),
  'attribution-phone-duration': z.string().default('14'),
  'attribution-commerce-duration': z.string().default('120'),
})

export type TerritorySettingsInput = z.infer<typeof territorySettingsSchema>
