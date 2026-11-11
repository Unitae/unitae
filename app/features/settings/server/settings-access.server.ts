import { ResponsibilityScope } from '~/features/events'
import { getResponsibleTemplateIds } from '~/features/events/index.server'
import type { SettingsAccess } from '~/features/settings/settings-sections'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

/**
 * What decides the parts of Réglages a viewer may open: their rights, plus whether a role they hold runs a programme
 * template (either delegation), which opens the templates without any right. A template manager's right already opens
 * them, so their roles are not looked up.
 */
export async function loadSettingsAccess(
  db: TransactionClient,
  permissions: ReadonlySet<Permission>,
  userId: number,
  congregationId: number,
): Promise<SettingsAccess> {
  if (permissions.has(Permission.CanManageProgramTemplates)) return { permissions, templateResponsible: false }
  const templates = await getResponsibleTemplateIds(db, userId, congregationId, ResponsibilityScope.Service)
  return { permissions, templateResponsible: templates.length > 0 }
}
