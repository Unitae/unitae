import { EMPTY_MEETING, getTemplateById, listScheduleTemplatesForSettings } from '~/features/events/index.server'
import { listDelegatableRoles } from '~/shared/domain/roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getRoleDisplayName } from '~/shared/types/role'

/**
 * Everything a meeting type's page shows: the type, how many programmes use it, and the schedule templates it uses in
 * its order, every template it may come to use, with the roles their responsible may be. Their parts and duties are « Modèles de planning »'s since 6a-1c.
 */
export async function getTemplatePage(db: TransactionClient, templateId: number, congregationId: number) {
  const template = await getTemplateById(db, templateId, congregationId)
  if (!template) return null

  const [eventCount, links, scheduleTemplates, delegatable] = await Promise.all([
    // Empty meetings created ahead do not make a template « in use » (see deleteTemplate).
    db.event.count({ where: { templateId, congregationId, NOT: EMPTY_MEETING } }),
    db.eventKindScheduleTemplate.findMany({
      where: { eventKindId: templateId, congregationId },
      select: { scheduleTemplateId: true },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    }),
    listScheduleTemplatesForSettings(db, congregationId),
    listDelegatableRoles(db, congregationId),
  ])

  const byId = new Map(scheduleTemplates.map(each => [each.id, each]))
  return {
    template,
    eventCount,
    scheduleTemplates: links.flatMap(link => byId.get(link.scheduleTemplateId) ?? []),
    // Every template, for « Utiliser un modèle » (6b-2).
    allScheduleTemplates: scheduleTemplates,
    roles: delegatable.map(role => ({ id: role.id, label: getRoleDisplayName(role) })),
  }
}
