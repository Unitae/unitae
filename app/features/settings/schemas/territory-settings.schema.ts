import { z } from 'zod'

export const territorySettingsSchema = z.object({
  zips: z.string().default(''),
  territory: z.string().default(''),
  'bano-url': z.string().default(''),
  'prospection-validity': z.string().default(''),
  'phone-territory-active': z.string().optional().transform(v => v === 'on' || v === 'true'),
})

export type TerritorySettingsInput = z.infer<typeof territorySettingsSchema>
