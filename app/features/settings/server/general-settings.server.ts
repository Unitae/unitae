import type { GeneralSettingsInput } from '~/features/settings/schemas/general-settings.schema'
import { unscopedDb } from '~/shared/infra/db.server'

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
