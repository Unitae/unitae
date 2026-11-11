import { z } from 'zod'
import * as m from '~/i18n/paraglide/messages'

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

/** A whole number of `unit` from 1 to `max`; anything else, a blank included, says what to type. */
const count = (max: number, message: () => string) =>
  z.coerce.number({ error: message }).int({ error: message }).min(1, { error: message }).max(max, { error: message })

export const territorySettingsSchema = z.object({
  zips: z.string().default(''),
  'bano-url': z
    .string()
    .default('')
    .refine(isEmptyOrHttpsUrl, { error: () => m.settings_bano_url_invalid() }),
  'prospection-validity': count(120, () => m.settings_validity_months_required()),
  'phone-territory-active': z
    .string()
    .optional()
    .transform(v => v === 'on' || v === 'true'),
  'map-tab-active': z
    .string()
    .optional()
    .transform(v => v === 'on' || v === 'true'),
  'pmr-active': z
    .string()
    .optional()
    .transform(v => v === 'on' || v === 'true'),
  'attribution-default-duration': count(365, () => m.settings_duration_days_required()),
  'attribution-phone-duration': count(365, () => m.settings_duration_days_required()),
  'attribution-commerce-duration': count(365, () => m.settings_duration_days_required()),
  'kind-roles-Classical': roleIdsField.default([]),
  'kind-roles-Univ': roleIdsField.default([]),
  'kind-roles-Commerces': roleIdsField.default([]),
  'kind-roles-Phone': roleIdsField.default([]),
  'kind-roles-Hotel': roleIdsField.default([]),
})

export type TerritorySettingsInput = z.infer<typeof territorySettingsSchema>
