import { z } from 'zod'

function isEmptyOrHttpsUrl(value: string): boolean {
  if (value === '') return true
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export const territorySettingsSchema = z.object({
  zips: z.string().default(''),
  'bano-url': z.string().default('').refine(isEmptyOrHttpsUrl, 'URL invalide (https requis)'),
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
