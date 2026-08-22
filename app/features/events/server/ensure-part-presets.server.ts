import type { locales } from '~/i18n/paraglide/runtime'
import type { TransactionClient } from '~/shared/infra/db.server'
import { seedDefaultPartPresets } from './seed-part-presets.server'

type Locale = (typeof locales)[number]

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
}

/**
 * Gives a congregation the default part presets if it has none.
 *
 * Congregations are seeded once, at registration, so any that predate presets
 * would otherwise never get them — there is no second pass in multi-tenant mode.
 * Rather than a one-off script someone has to remember to run, the defaults
 * appear the first time a congregation actually looks at its programme
 * configuration.
 *
 * Deliberately keyed on "has none at all" rather than on the catalogue being
 * complete: a congregation that has deleted a kind it does not use should not
 * have it silently restored on the next page load.
 *
 * Cheap in the overwhelmingly common case — one count, then nothing.
 */
export async function ensureDefaultPartPresets(
  db: TransactionClient,
  congregationId: number,
  locale: string,
): Promise<void> {
  const existing = await db.partPreset.count({ where: { congregationId } })
  if (existing > 0) return

  const seedLocale: Locale = locale === 'en' ? 'en' : 'fr'

  try {
    await seedDefaultPartPresets(db, congregationId, seedLocale)
  } catch (error) {
    // Two loads can both see zero and both seed. The loser hits the unique key
    // on (key, congregationId), by which point the presets exist — which is the
    // whole point of the call. Anything else is a real failure.
    if (!isUniqueViolation(error)) throw error
  }
}
