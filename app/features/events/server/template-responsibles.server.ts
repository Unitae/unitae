import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { listDelegatableRoles } from '~/shared/domain/roles.server'
import { ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { removeTemplateResponsible, setTemplateResponsible } from './event-templates.server'

export interface TemplateResponsibles {
  /** The role that runs the whole programme (null: only the programme managers). */
  programmeRoleId: number | null
  /** The role that runs the service parts only. */
  serviceRoleId: number | null
}

/**
 * Saves who runs a template: each part (the programme, the services) on its own, written only when it changed. A role
 * must be one the congregation can delegate a template to; any other id, another congregation's included, is refused.
 * Returns whether anything changed.
 */
export async function saveTemplateResponsibles(
  db: TransactionClient,
  templateId: number,
  wanted: TemplateResponsibles,
  congregationId: number,
  actorId: number,
): Promise<boolean> {
  const delegatable = new Set((await listDelegatableRoles(db, congregationId)).map(role => role.id))
  for (const roleId of [wanted.programmeRoleId, wanted.serviceRoleId]) {
    if (roleId != null && !delegatable.has(roleId))
      throw new ValidationError('roleId', 'This role cannot run a template')
  }

  const rows = await db.templateResponsible.findMany({
    where: { templateId, congregationId },
    select: { scope: true, roleId: true },
  })
  const current = (scope: ResponsibilityScope) => rows.find(row => row.scope === scope)?.roleId ?? null
  const changes = [
    { scope: ResponsibilityScope.Programme, from: current(ResponsibilityScope.Programme), to: wanted.programmeRoleId },
    { scope: ResponsibilityScope.Service, from: current(ResponsibilityScope.Service), to: wanted.serviceRoleId },
  ]
  if (changes.every(change => change.from === change.to)) return false

  for (const { scope, from, to } of changes) {
    if (from === to) continue
    if (to == null) await removeTemplateResponsible(db, templateId, congregationId, scope)
    else await setTemplateResponsible(db, templateId, to, congregationId, scope)
  }

  audit({
    action: AuditAction.TemplateResponsiblesChanged,
    congregationId,
    actorId,
    entityType: 'EventTemplate',
    entityId: templateId,
    metadata: {
      programme: { from: changes[0]?.from ?? null, to: changes[0]?.to ?? null },
      service: { from: changes[1]?.from ?? null, to: changes[1]?.to ?? null },
    },
  })
  return true
}
