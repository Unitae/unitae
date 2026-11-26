import { ScheduleKind } from '~/features/events'
import { listPartPresets, ownerWhere } from '~/features/events/index.server'
import { listRoles } from '~/shared/domain/roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { distinct } from '~/shared/utils/distinct'

/**
 * A schedule template's items as « Modèles de planning » edits them: a programme template's parts, or a duties
 * template's services, with who may take each and what their forms offer. They are its own (6a-1c-2), filed under the
 * first kind that uses it too when one does; a row of that kind not placed in a schedule template yet counts as its.
 * A programme template's rooms come with it, the main room first, and each part with the rooms it is held in. Null
 * when the template is not the congregation's.
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
  const own = { ...ownerWhere({ scheduleTemplateId, templateId: kindId }), congregationId }
  const [partRows, serviceRows, roles, presets] = await Promise.all([
    template.kind === ScheduleKind.Programme
      ? db.templatePart.findMany({ where: own, orderBy: { order: 'asc' } })
      : Promise.resolve([]),
    template.kind === ScheduleKind.Duty
      ? db.templateServicePart.findMany({ where: own, orderBy: [{ order: 'asc' }, { id: 'asc' }] })
      : Promise.resolve([]),
    listRoles(db, congregationId),
    listPartPresets(db, congregationId),
  ])
  const [partRoles, serviceRoles] = await Promise.all([
    db.templatePartAllowedRole.findMany({
      where: { partId: { in: partRows.map(part => part.id) }, congregationId },
      select: { partId: true, roleId: true, asKind: true },
    }),
    db.templateServicePartAllowedRole.findMany({
      where: { servicePartId: { in: serviceRows.map(service => service.id) }, congregationId },
      select: { servicePartId: true, roleId: true },
    }),
  ])
  const allowed = (partId: number, asKind: string) =>
    partRoles.filter(row => row.partId === partId && row.asKind === asKind).map(row => row.roleId)
  const parts = partRows.map(part => ({
    ...part,
    allowedSpeakerRoleIds: allowed(part.id, 'speaker'),
    allowedReaderRoleIds: allowed(part.id, 'reader'),
  }))
  const services = serviceRows.map(service => ({
    ...service,
    allowedRoleIds: serviceRoles.filter(row => row.servicePartId === service.id).map(row => row.roleId),
  }))
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
    kindId,
    parts: parts.map(part => ({ ...part, roomIds: roomIdsOf(part.id) })),
    /** Its rooms, the main room first: its name null until someone names it (read « Salle principale »). */
    rooms: rooms.map(room => ({
      id: room.id,
      name: room.name,
      isMain: room.key === 'main',
      partCount: held.filter(row => row.roomId === room.id).length,
    })),
    services,
    roles: roles.map(({ id, key, name, isBuiltIn }) => ({ id, key, name, isBuiltIn })),
    presets,
    sectionSuggestions: distinct(parts.map(part => part.section)).filter(Boolean),
  }
}
