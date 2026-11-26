import { ScheduleKind } from '~/features/events/model/schedule.type'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import { listDelegatableRoles } from '~/shared/domain/roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'

/** « Nouveau modèle »: what it holds (parts or services), its name, and who answers for it (none: the managers). */
export interface NewScheduleTemplate {
  name: string
  kind: ScheduleKind
  responsibleRoleId: number | null
}

/**
 * Creates a schedule template from « Modèles de planning » (6a-1c-2): named, of parts or of services, with a responsible
 * the congregation may hand a template to, or none. No kind uses it yet: « Ajouter un planning » offers it on the
 * meetings, and its items are its own (template-owner.ts). Its main room comes with it (the ScheduleTemplate_rooms
 * trigger). Refused without a name, or with a role it may not have.
 */
export async function createScheduleTemplate(
  db: TransactionClient,
  input: NewScheduleTemplate,
  congregationId: number,
  actorId: number,
): Promise<{ ok: true; id: number } | { ok: false; reason: 'name' | 'role' }> {
  const name = sanitizeText(input.name).trim()
  if (name === '') return { ok: false, reason: 'name' }
  const { responsibleRoleId } = input
  if (responsibleRoleId != null) {
    const delegatable = (await listDelegatableRoles(db, congregationId)).some(role => role.id === responsibleRoleId)
    if (!delegatable) return { ok: false, reason: 'role' }
  }
  const kind = input.kind === ScheduleKind.Duty ? ScheduleKind.Duty : ScheduleKind.Programme
  const { id } = await db.scheduleTemplate.create({
    data: { name, kind, responsibleRoleId, congregationId },
    select: { id: true },
  })
  await auditInTransaction(db, {
    action: AuditAction.ScheduleTemplateCreated,
    congregationId,
    actorId,
    entityType: 'ScheduleTemplate',
    entityId: id,
    metadata: { name, kind, responsibleRoleId },
  })
  return { ok: true, id }
}
