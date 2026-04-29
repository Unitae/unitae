import type { GeneralSettingsInput } from '~/features/settings/schemas/general-settings.schema'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { unscopedDb } from '~/shared/infra/db.server'

export async function updateGeneralSettings(
  congregationId: number,
  input: GeneralSettingsInput,
  actorId: number,
): Promise<void> {
  await unscopedDb.congregation.update({
    where: { id: congregationId },
    data: {
      displayName: input.displayName || null,
      locale: input.locale,
      domain: input.domain,
    },
  })

  audit({
    action: AuditAction.GeneralSettingsUpdated,
    congregationId,
    actorId,
    metadata: { displayName: input.displayName, locale: input.locale, domain: input.domain },
  })
}
