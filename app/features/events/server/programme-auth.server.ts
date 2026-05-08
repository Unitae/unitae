import { isTemplateResponsible } from '~/features/events/server/programme-templates.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

export async function canEditEvent(
  db: TransactionClient,
  can: (role: Permission) => boolean,
  userId: number,
  templateId: number | null,
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.ProgramManager)) return true
  if (templateId == null) return false
  const responsible = await isTemplateResponsible(db, templateId, userId, congregationId)
  return responsible != null
}
