import { z } from 'zod'

/**
 * Roles allowed to be attributed a territory of a given kind, one field per
 * kind. A checkbox group posts nothing when every box is cleared, so the
 * preprocess maps "absent" to [] — an explicit "no restriction" — rather than
 * letting the kind fall through unchanged.
 *
 * The keys are the built-in `TerritoryKindKey` members. They are spelled out
 * rather than derived so the parsed value stays typed; when congregations can
 * define their own kinds this becomes a dynamic parse.
 */
const roleIdsField = z.preprocess(
  v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]),
  z.array(z.coerce.number().int().positive()),
)

export const KIND_ROLES_FIELD_PREFIX = 'kind-roles-'

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
  'attribution-phone-duration': z.string().default('14'),
  'attribution-commerce-duration': z.string().default('120'),
  'kind-roles-Classical': roleIdsField.default([]),
  'kind-roles-Univ': roleIdsField.default([]),
  'kind-roles-Commerces': roleIdsField.default([]),
  'kind-roles-Phone': roleIdsField.default([]),
  'kind-roles-Hotel': roleIdsField.default([]),
})

export type TerritorySettingsInput = z.infer<typeof territorySettingsSchema>
