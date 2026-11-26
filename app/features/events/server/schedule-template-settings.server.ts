import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import { listDelegatableRoles } from '~/shared/domain/roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'
import { scheduleTemplateNameTaken } from './create-schedule-template.server'

/** What Réglages › « Modèles de planning » saves on a schedule template (6a): a field left out is left as it is. */
export interface ScheduleTemplateChange {
  name?: string | null
  responsibleRoleId?: number | null
}

/**
 * Why a change is refused: a role the congregation may not delegate a template to, no name where no key labels it, or a
 * name another template reads as.
 */
export type ScheduleTemplateRefusal = 'role' | 'name' | 'taken'

/**
 * Saves a schedule template's name and responsible, as the page asks; null when the template is not the
 * congregation's. The kind's derivation (syncTemplateScheduleTemplates) no longer writes a name over it, and takes the
 * responsible from where this writes it (saveResponsible), so the next save of the kind keeps both. Schedules already
 * made keep their own names. Only what changes is written and audited: a role is checked, and written to the kinds,
 * only when it is not the one stored, so a stored role nobody may pick any more survives a rename.
 */
export async function updateScheduleTemplate(
  db: TransactionClient,
  scheduleTemplateId: number,
  change: ScheduleTemplateChange,
  congregationId: number,
  actorId: number,
): Promise<{ ok: true } | { ok: false; reason: ScheduleTemplateRefusal } | null> {
  const template = await db.scheduleTemplate.findFirst({
    where: { id: scheduleTemplateId, congregationId },
    select: {
      id: true,
      key: true,
      kind: true,
      name: true,
      responsibleRoleId: true,
    },
  })
  if (template == null) return null
  const name =
    change.name === undefined ? template.name : change.name == null ? null : sanitizeText(change.name).trim() || null
  // A template is labelled by its name or its key (ScheduleTemplate_label_check): only a keyed one may go unnamed.
  if (name == null && template.key == null) return { ok: false, reason: 'name' }
  const roleId = change.responsibleRoleId === undefined ? template.responsibleRoleId : change.responsibleRoleId
  const roleChanges = roleId !== template.responsibleRoleId
  // Only a role the congregation may hand a template to, as the kind's page has always required.
  if (roleChanges && roleId != null) {
    const delegatable = (await listDelegatableRoles(db, congregationId)).some(role => role.id === roleId)
    if (!delegatable) return { ok: false, reason: 'role' }
  }
  const nameChanges = name !== template.name
  if (!nameChanges && !roleChanges) return { ok: true }
  if (nameChanges && name != null && (await scheduleTemplateNameTaken(db, name, congregationId, template.id))) {
    return { ok: false, reason: 'taken' }
  }

  // The template holds its responsible (6b-1b): the kinds using it no longer carry one for it.
  await db.scheduleTemplate.update({
    where: { id_congregationId: { id: scheduleTemplateId, congregationId } },
    data: { ...(nameChanges && { name }), ...(roleChanges && { responsibleRoleId: roleId }) },
  })
  await auditInTransaction(db, {
    action: AuditAction.ScheduleTemplateUpdated,
    congregationId,
    actorId,
    entityType: 'ScheduleTemplate',
    entityId: scheduleTemplateId,
    metadata: {
      ...(nameChanges && { name: { from: template.name, to: name } }),
      ...(roleChanges && { responsibleRoleId: { from: template.responsibleRoleId, to: roleId } }),
    },
  })
  return { ok: true }
}
