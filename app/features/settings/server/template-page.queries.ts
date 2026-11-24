import { EMPTY_MEETING, getTemplateById, listPartPresets } from '~/features/events/index.server'
import { listRoles } from '~/shared/domain/roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { distinct } from '~/shared/utils/distinct'

/**
 * Everything a template's page shows: the template with the roles allowed on its parts and services, how many
 * programmes use it, and what its fields offer (roles, part types, the sections and rooms it already has).
 */
export async function getTemplatePage(db: TransactionClient, templateId: number, congregationId: number) {
  const template = await getTemplateById(db, templateId, congregationId)
  if (!template) return null

  const [partRoles, serviceRoles, eventCount, roles, presets] = await Promise.all([
    db.templatePartAllowedRole.findMany({
      where: { partId: { in: template.parts.map(part => part.id) }, congregationId },
      select: { partId: true, roleId: true, asKind: true },
    }),
    db.templateServicePartAllowedRole.findMany({
      where: { servicePartId: { in: template.serviceParts.map(service => service.id) }, congregationId },
      select: { servicePartId: true, roleId: true },
    }),
    // Empty meetings created ahead do not make a template « in use » (see deleteTemplate).
    db.event.count({
      where: {
        templateId,
        congregationId,
        NOT: EMPTY_MEETING,
      },
    }),
    listRoles(db, congregationId),
    listPartPresets(db, congregationId),
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
    eventCount,
    roles: roles.map(({ id, key, name, isBuiltIn }) => ({ id, key, name, isBuiltIn })),
    presets,
    sectionSuggestions: distinct(template.parts.map(part => part.section)),
    trackSuggestions: distinct(template.parts.map(part => part.track)),
  }
}
