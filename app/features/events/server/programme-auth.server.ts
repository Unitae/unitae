import { isTemplateResponsible } from '~/features/events/server/programme-templates.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Role } from '~/shared/types/role'

export async function canEditEvent(
  db: TransactionClient,
  can: (role: Role) => boolean,
  userId: number,
  templateId: number | null,
  congregationId: number,
): Promise<boolean> {
  if (can(Role.ProgramManager)) return true
  if (templateId == null) return false
  const responsible = await isTemplateResponsible(db, templateId, userId, congregationId)
  return responsible != null
}
