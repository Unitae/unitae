import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import { listDelegatableRoles } from '~/shared/domain/roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'
import { removeTemplateResponsible, setTemplateResponsible } from './event-templates.server'

/** What Réglages › « Modèles de planning » saves on a schedule template (6a): a field left out is left as it is. */
export interface ScheduleTemplateChange {
  name?: string | null
  responsibleRoleId?: number | null
}

/** Why a change is refused: a role the congregation may not delegate a template to, or no name where no key labels it. */
export type ScheduleTemplateRefusal = 'role' | 'name'

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
      eventKinds: { select: { eventKindId: true }, orderBy: { eventKindId: 'asc' } },
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

  if (nameChanges) {
    await db.scheduleTemplate.update({
      where: { id_congregationId: { id: scheduleTemplateId, congregationId } },
      data: { name },
    })
  }
  if (roleChanges) await saveResponsible(db, template, roleId, congregationId)
  // What the derivation stored, which may differ from what was asked (two kinds suggesting one template: the last wins).
  const stored = roleChanges
    ? (await db.scheduleTemplate.findFirstOrThrow({ where: { id: scheduleTemplateId, congregationId } }))
        .responsibleRoleId
    : template.responsibleRoleId
  await auditInTransaction(db, {
    action: AuditAction.ScheduleTemplateUpdated,
    congregationId,
    actorId,
    entityType: 'ScheduleTemplate',
    entityId: scheduleTemplateId,
    metadata: {
      ...(nameChanges && { name: { from: template.name, to: name } }),
      ...(stored !== template.responsibleRoleId && {
        responsibleRoleId: { from: template.responsibleRoleId, to: stored },
      }),
      // The kinds whose responsibles this wrote: who edits those kinds changes with it.
      ...(roleChanges &&
        template.eventKinds.length > 0 && {
          eventKindIds: template.eventKinds.map(link => link.eventKindId),
        }),
    },
  })
  return { ok: true }
}
/**
 * The responsible goes where the kind's derivation reads it until 6a-2: each suggesting kind's TemplateResponsible row
 * of the template's side (the programme scope, or the services'), from which syncTemplateScheduleTemplates sets the
 * template's role — so the next save of the kind keeps it. A duties template takes the services row only: without one
 * it has no responsible, whoever runs the programme (user, 2026-11-24). A template no kind suggests holds its role alone.
 */
async function saveResponsible(
  db: TransactionClient,
  template: { id: number; kind: string; eventKinds: { eventKindId: number }[] },
  roleId: number | null,
  congregationId: number,
) {
  if (template.eventKinds.length === 0) {
    await db.scheduleTemplate.update({
      where: { id_congregationId: { id: template.id, congregationId } },
      data: { responsibleRoleId: roleId },
    })
    return
  }
  const scope = template.kind === ScheduleKind.Programme ? ResponsibilityScope.Programme : ResponsibilityScope.Service
  for (const { eventKindId } of template.eventKinds) {
    if (roleId == null) await removeTemplateResponsible(db, eventKindId, congregationId, scope)
    else await setTemplateResponsible(db, eventKindId, roleId, congregationId, scope)
  }
}
