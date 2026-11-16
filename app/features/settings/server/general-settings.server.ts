import { reanchorEmptyMeetings } from '~/features/events/index.server'
import type { GeneralSettingsInput } from '~/features/settings/schemas/general-settings.schema'
import { tenantUrl } from '~/shared/domain/congregation.server'
import { unscopedDb, withScope } from '~/shared/infra/db.server'

export type GeneralSettings = {
  displayName: string
  locale: string
  timezone: string
  domain: string
  /** The `<slug>.<base domain>` host the app always opens at, multi-tenant only; a custom domain comes on top. */
  address: string | null
}

// `displayName` overrides `name`, which the control plane sets at registration and may change later: a
// congregation created through it has no override yet, so the page shows the name everyone already sees.
export async function getGeneralSettings(congregationId: number): Promise<GeneralSettings> {
  const congregation = await unscopedDb.congregation.findUniqueOrThrow({
    where: { id: congregationId },
    select: { name: true, slug: true, displayName: true, locale: true, timezone: true, domain: true },
  })

  return {
    displayName: congregation.displayName ?? congregation.name,
    locale: congregation.locale ?? 'fr',
    timezone: congregation.timezone ?? 'Europe/Paris',
    domain: congregation.domain ?? '',
    address: process.env.UNITAE_MULTI_TENANT === 'true' ? new URL(tenantUrl(congregation.slug)).host : null,
  }
}

// The congregation root columns are written via unscopedDb: the tenant-scoping extension filters by
// `congregationId`, but the Congregation row is itself the tenant root (targeted by its primary key
// `id`), so it is not subject to that filter. Scoped Settings go through the scoped db instead (see
// password-security.server.ts).
export async function updateGeneralSettings(congregationId: number, input: GeneralSettingsInput): Promise<void> {
  const { name, timezone: previousTimeZone } = await unscopedDb.congregation.findUniqueOrThrow({
    where: { id: congregationId },
    select: { name: true, timezone: true },
  })
  // The page shows `name` when there is no override: saving it unchanged must not turn it into one, or a later
  // rename by the control plane would no longer show.
  const displayName = input.displayName?.trim()
  await unscopedDb.congregation.update({
    where: { id: congregationId },
    data: {
      displayName: displayName && displayName !== name ? displayName : null,
      locale: input.locale,
      timezone: input.timezone,
      domain: input.domain,
    },
  })
  // The meetings created ahead were set in the old zone: same local day, the template's hours in the new one.
  if (previousTimeZone !== input.timezone) {
    await withScope(congregationId, db =>
      reanchorEmptyMeetings(db, { congregationId, previousTimeZone, timeZone: input.timezone, now: new Date() }),
    )
  }
}
