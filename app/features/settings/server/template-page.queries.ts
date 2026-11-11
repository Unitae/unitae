import { findResponsible, ResponsibilityScope } from '~/features/events'
import { getTemplateById, listPartPresets } from '~/features/events/index.server'
import { findMembersWithAnyRole } from '~/shared/auth/permissions.server'
import { listDelegatableRoles, listRoles } from '~/shared/domain/roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getRoleDisplayName } from '~/shared/types/role'
import { distinct } from '~/shared/utils/distinct'
import { formatPersonName } from '~/shared/utils/format-person-name'

/** Who a responsibility lands on today: the members holding the role. A role nobody holds delegates to nobody. */
async function holdersOf(db: TransactionClient, roleId: number | null, congregationId: number): Promise<string[]> {
  if (roleId == null) return []
  const ids = await findMembersWithAnyRole(db, [roleId], congregationId)
  if (ids.length === 0) return []
  const members = await db.member.findMany({
    where: { id: { in: ids }, congregationId },
    select: { id: true, firstname: true, lastname: true },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
  return members.map(member => formatPersonName(member))
}

/**
 * Everything a template's page shows: the template with the roles allowed on its parts and services, who runs its
 * programme and its services today, how many programmes use it, and what its fields offer (roles, part types, the
 * sections and rooms it already has).
 */
export async function getTemplatePage(db: TransactionClient, templateId: number, congregationId: number) {
  const template = await getTemplateById(db, templateId, congregationId)
  if (!template) return null

  const [partRoles, serviceRoles, eventCount, roles, delegatable, presets] = await Promise.all([
    db.templatePartAllowedRole.findMany({
      where: { partId: { in: template.parts.map(part => part.id) }, congregationId },
      select: { partId: true, roleId: true, asKind: true },
    }),
    db.templateServicePartAllowedRole.findMany({
      where: { servicePartId: { in: template.serviceParts.map(service => service.id) }, congregationId },
      select: { servicePartId: true, roleId: true },
    }),
    db.event.count({ where: { templateId, congregationId } }),
    listRoles(db, congregationId),
    listDelegatableRoles(db, congregationId),
    listPartPresets(db, congregationId),
  ])

  const programmeRoleId = findResponsible(template.responsibles, ResponsibilityScope.Programme)?.role.id ?? null
  const serviceRoleId = findResponsible(template.responsibles, ResponsibilityScope.Service)?.role.id ?? null
  const [programmeHolders, serviceHolders] = await Promise.all([
    holdersOf(db, programmeRoleId, congregationId),
    holdersOf(db, serviceRoleId, congregationId),
  ])
  const allowed = (partId: number, asKind: string) =>
    partRoles.filter(row => row.partId === partId && row.asKind === asKind).map(row => row.roleId)

  return {
    template: {
      ...template,
      parts: template.parts.map(part => ({
        ...part,
        allowedSpeakerRoleIds: allowed(part.id, 'speaker'),
        allowedReaderRoleIds: allowed(part.id, 'reader'),
      })),
      serviceParts: template.serviceParts.map(service => ({
        ...service,
        allowedRoleIds: serviceRoles.filter(row => row.servicePartId === service.id).map(row => row.roleId),
      })),
    },
    responsibles: {
      programme: { roleId: programmeRoleId, holders: programmeHolders },
      service: { roleId: serviceRoleId, holders: serviceHolders },
    },
    eventCount,
    roles: roles.map(({ id, key, name, isBuiltIn }) => ({ id, key, name, isBuiltIn })),
    delegatableRoles: delegatable.map(role => ({ id: role.id, label: getRoleDisplayName(role) })),
    presets,
    sectionSuggestions: distinct(template.parts.map(part => part.section)),
    trackSuggestions: distinct(template.parts.map(part => part.track)),
  }
}
