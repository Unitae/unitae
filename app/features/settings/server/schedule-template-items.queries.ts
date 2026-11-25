import { ScheduleKind } from '~/features/events'
import type { TransactionClient } from '~/shared/infra/db.server'
import { distinct } from '~/shared/utils/distinct'
import { getTemplatePage } from './template-page.queries'

/**
 * A schedule template's items as « Modèles de planning » edits them: a programme template's parts, or a duties
 * template's services, with what their forms offer. Until its items stop belonging to a kind (6a-1c-2) they are read,
 * and written, through the first kind that uses the template; a template no kind uses has none to show. A kind's item
 * not placed in a schedule template yet counts as its template's of that kind. A programme template's rooms come
 * with it, the main room first, and each part with the rooms it is held in. Null when the template is not the
 * congregation's.
 */
export async function getScheduleTemplateItems(
  db: TransactionClient,
  scheduleTemplateId: number,
  congregationId: number,
) {
  const template = await db.scheduleTemplate.findFirst({
    where: { id: scheduleTemplateId, congregationId },
    select: {
      kind: true,
      eventKinds: { select: { eventKindId: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }], take: 1 },
    },
  })
  if (template == null) return null
  const kindId = template.eventKinds[0]?.eventKindId ?? null
  const page = kindId == null ? null : await getTemplatePage(db, kindId, congregationId)
  const own = (item: { scheduleTemplateId: number | null }) =>
    (item.scheduleTemplateId ?? scheduleTemplateId) === scheduleTemplateId
  const parts = template.kind === ScheduleKind.Programme ? (page?.template.parts ?? []).filter(own) : []
  const services = template.kind === ScheduleKind.Duty ? (page?.template.serviceParts ?? []).filter(own) : []
  const [rooms, held] =
    template.kind === ScheduleKind.Programme
      ? await Promise.all([
          db.scheduleTemplateRoom.findMany({
            where: { scheduleTemplateId, congregationId },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
            select: { id: true, name: true, key: true },
          }),
          db.templatePartRoom.findMany({
            where: { templatePartId: { in: parts.map(part => part.id) }, congregationId },
            select: { templatePartId: true, roomId: true },
          }),
        ])
      : [[], []]
  const roomIdsOf = (partId: number) => held.filter(row => row.templatePartId === partId).map(row => row.roomId)
  return {
    kind: template.kind,
    kindId: page == null ? null : kindId,
    parts: parts.map(part => ({ ...part, roomIds: roomIdsOf(part.id) })),
    /** Its rooms, the main room first: its name null until someone names it (read « Salle principale »). */
    rooms: rooms.map(room => ({
      id: room.id,
      name: room.name,
      isMain: room.key === 'main',
      partCount: held.filter(row => row.roomId === room.id).length,
    })),
    services,
    roles: page?.roles ?? [],
    presets: page?.presets ?? [],
    sectionSuggestions: distinct(parts.map(part => part.section)).filter(Boolean),
  }
}
