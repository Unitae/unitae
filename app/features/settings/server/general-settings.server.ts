import type { GeneralSettingsInput } from '~/features/settings/schemas/general-settings.schema'
import { unscopedDb } from '~/shared/infra/db.server'

// The congregation root columns are written via unscopedDb: the tenant-scoping extension filters by
// `congregationId`, but the Congregation row is itself the tenant root (targeted by its primary key
// `id`), so it is not subject to that filter. Scoped Settings go through the scoped db instead (see
// password-security.server.ts).
export async function updateGeneralSettings(congregationId: number, input: GeneralSettingsInput): Promise<void> {
  await unscopedDb.congregation.update({
    where: { id: congregationId },
    data: {
      displayName: input.displayName || null,
      locale: input.locale,
      timezone: input.timezone,
      domain: input.domain,
    },
  })
}
