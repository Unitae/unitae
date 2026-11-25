import { isSystemTemplate } from '~/features/events/model/event-template.type'
import { syncTemplateScheduleTemplates } from '~/features/events/server/schedule-templates.server'
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function duplicateTemplate(
  db: TransactionClient,
  templateId: number,
  congregationId: number,
  actorId: number,
) {
  const source = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: { allowedRoles: true, rooms: { include: { room: true } } },
      },
      serviceParts: { orderBy: [{ order: 'asc' }, { id: 'asc' }], include: { allowedRoles: true } },
    },
  })
  if (!source) return null

  // System templates are looked up by key at runtime — duplicating them just
  // clutters the list with an untethered `-copy-<ts>` row. The UI hides the
  // Duplicate button; this is the server-side match.
  if (isSystemTemplate(source.key)) return null

  const duplicated = await db.eventTemplate.create({
    data: {
      name: m.events_template_copy_name({ name: source.name }),
      key: `${source.key}-copy-${Date.now()}`,
      description: source.description,
      weekDay: source.weekDay,
      isRecurring: source.isRecurring,
      attendanceKind: source.attendanceKind,
      startTime: source.startTime,
      endTime: source.endTime,
      congregationId,
      parts: {
        create: source.parts.map(part => ({
          name: part.name,
          section: part.section,
          track: part.track,
          trackOrder: part.trackOrder,
          order: part.order,
          durationMin: part.durationMin,
          allowExternalSpeaker: part.allowExternalSpeaker,
          speakerLabel: part.speakerLabel,
          readerLabel: part.readerLabel,
          // The kind travels with the part. Without it the copy keeps the
          // name but loses its share message, slot labels and
          // external-speaker rule, and looks unclassified everywhere.
          presetId: part.presetId,
          congregationId,
        })),
      },
      serviceParts: {
        create: source.serviceParts.map(role => ({
          name: role.name,
          key: `${role.key}-copy-${Date.now()}`,
          order: role.order,
          congregationId,
        })),
      },
    },
    include: {
      parts: { orderBy: { order: 'asc' } },
      serviceParts: { orderBy: { name: 'asc' } },
    },
  })

  const sourcePartsByOrder = new Map(source.parts.map(p => [p.order, p]))
  const sourceServicePartsByName = new Map(source.serviceParts.map(r => [r.name, r]))

  for (const newPart of duplicated.parts) {
    const sourcePart = sourcePartsByOrder.get(newPart.order)
    if (!sourcePart) continue
    const speakerRoleIds = sourcePart.allowedRoles.filter(r => r.asKind === 'speaker').map(r => r.roleId)
    const readerRoleIds = sourcePart.allowedRoles.filter(r => r.asKind === 'reader').map(r => r.roleId)
    if (speakerRoleIds.length > 0) {
      await db.templatePartAllowedRole.createMany({
        data: speakerRoleIds.map(roleId => ({ partId: newPart.id, roleId, asKind: 'speaker', congregationId })),
        skipDuplicates: true,
      })
    }
    if (readerRoleIds.length > 0) {
      await db.templatePartAllowedRole.createMany({
        data: readerRoleIds.map(roleId => ({ partId: newPart.id, roleId, asKind: 'reader', congregationId })),
        skipDuplicates: true,
      })
    }
  }

  for (const newRole of duplicated.serviceParts) {
    const sourceRole = sourceServicePartsByName.get(newRole.name)
    if (!sourceRole || sourceRole.allowedRoles.length === 0) continue
    await db.templateServicePartAllowedRole.createMany({
      data: sourceRole.allowedRoles.map(r => ({ servicePartId: newRole.id, roleId: r.roleId, congregationId })),
      skipDuplicates: true,
    })
  }

  await syncTemplateScheduleTemplates(db, duplicated.id, congregationId)
  await copyRooms(db, source.parts, duplicated.id, congregationId)
  audit({
    action: AuditAction.TemplateDuplicated,
    congregationId,
    actorId,
    entityType: 'EventTemplate',
    entityId: duplicated.id,
    metadata: { from: templateId },
  })
  return duplicated
}

/**
 * The rooms travel with the parts: the copy's programme template gets the source's rooms (the main room's name too),
 * and each copied part is held in the same rooms as its source (matched by order, as the roles are).
 */
async function copyRooms(
  db: TransactionClient,
  // Rooms may be absent (a part read without them): held in the main room alone.
  sourceParts: { order: number; rooms?: { room: { key: string | null; name: string | null; order: number } }[] }[],
  duplicatedId: number,
  congregationId: number,
) {
  const roomsOf = (part: (typeof sourceParts)[number]) => part.rooms ?? []
  if (!sourceParts.some(part => roomsOf(part).length > 1 || roomsOf(part).some(row => row.room.name != null))) return
  const copies = await db.templatePart.findMany({
    where: { templateId: duplicatedId, congregationId },
    select: { id: true, order: true, scheduleTemplateId: true },
  })
  const scheduleTemplateId = copies.find(part => part.scheduleTemplateId != null)?.scheduleTemplateId
  if (scheduleTemplateId == null) return
  const sourceRooms = new Map<string, { key: string | null; name: string | null; order: number }>()
  for (const part of sourceParts) {
    for (const { room } of roomsOf(part)) sourceRooms.set(room.key ?? `room:${room.name}`, room)
  }
  const roomIds = new Map<string, number>()
  for (const [mark, room] of sourceRooms) {
    if (room.key === 'main') {
      const main = await db.scheduleTemplateRoom.findFirstOrThrow({ where: { scheduleTemplateId, key: 'main' } })
      if (room.name != null)
        await db.scheduleTemplateRoom.update({
          where: { id_congregationId: { id: main.id, congregationId } },
          data: { name: room.name },
        })
      roomIds.set(mark, main.id)
    } else {
      const created = await db.scheduleTemplateRoom.upsert({
        where: { scheduleTemplateId_name: { scheduleTemplateId, name: room.name ?? '' } },
        create: { name: room.name, order: room.order, scheduleTemplateId, congregationId },
        update: {},
      })
      roomIds.set(mark, created.id)
    }
  }
  const sourceByOrder = new Map(sourceParts.map(part => [part.order, part]))
  for (const copy of copies) {
    const source = sourceByOrder.get(copy.order)
    if (source == null) continue
    const held = roomsOf(source)
      .map(({ room }) => roomIds.get(room.key ?? `room:${room.name}`))
      .filter((id): id is number => id != null)
    if (held.length === 0) continue
    await db.templatePartRoom.deleteMany({ where: { templatePartId: copy.id, NOT: { roomId: { in: held } } } })
    await db.templatePartRoom.createMany({
      data: held.map(roomId => ({ templatePartId: copy.id, roomId, congregationId })),
      skipDuplicates: true,
    })
  }
}
