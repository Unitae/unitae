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

export async function getResponsibleTemplateIds(
  db: TransactionClient,
  userId: number,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.programmeTemplateResponsible.findMany({
    where: { userId, congregationId },
    select: { templateId: true },
  })
  return rows.map(r => r.templateId)
}

export async function canManageAnyProgram(
  db: TransactionClient,
  can: (role: Permission) => boolean,
  userId: number,
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.ProgramManager)) return true
  const ids = await getResponsibleTemplateIds(db, userId, congregationId)
  return ids.length > 0
}
