import { z } from 'zod'

export const territorySettingsSchema = z.object({
  zips: z.string().default(''),
  territory: z.string().default(''),
  'bano-url': z.string().default(''),
  'prospection-validity': z.string().default(''),
  'phone-territory-active': z
    .string()
    .optional()
    .transform(v => v === 'on' || v === 'true'),
  'attribution-default-duration': z.string().default('4'),
})

export type TerritorySettingsInput = z.infer<typeof territorySettingsSchema>
