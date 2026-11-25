import { isSystemTemplate } from '~/features/events/model/event-template.type'
import { syncTemplateScheduleTemplates } from '~/features/events/server/schedule-templates.server'
import { setTemplatePartRooms } from '~/features/events/server/template-rooms.server'
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

type SourceRoom = { key: string | null; name: string | null; order: number }
// Rooms may be absent (a part read without them): held in the main room alone.
type SourcePart = { order: number; rooms?: { room: SourceRoom }[] }

const roomsOf = (part: SourcePart) => (part.rooms ?? []).map(row => row.room)
const markOf = (room: SourceRoom) => room.key ?? `room:${room.name}`

/**
 * The rooms travel with the parts: the copy's programme template gets the source's rooms (the main room's name too),
 * and each copied part is held in the same rooms as its source (matched by order, as the roles are).
 */
async function copyRooms(
  db: TransactionClient,
  sourceParts: SourcePart[],
  duplicatedId: number,
  congregationId: number,
) {
  if (!sourceParts.some(part => roomsOf(part).length > 1 || roomsOf(part).some(room => room.name != null))) return
  const copies = await db.templatePart.findMany({
    where: { templateId: duplicatedId, congregationId },
    select: { id: true, order: true, scheduleTemplateId: true },
  })
  const scheduleTemplateId = copies.find(part => part.scheduleTemplateId != null)?.scheduleTemplateId
  if (scheduleTemplateId == null) return
  const roomIds = await writeRooms(db, sourceParts.flatMap(roomsOf), scheduleTemplateId, congregationId)
  const sourceByOrder = new Map(sourceParts.map(part => [part.order, part]))
  for (const copy of copies) {
    const source = sourceByOrder.get(copy.order)
    const held = source == null ? [] : roomsOf(source).flatMap(room => roomIds.get(markOf(room)) ?? [])
    if (held.length > 0) await setTemplatePartRooms(db, scheduleTemplateId, copy.id, held, congregationId)
  }
}

/** The source's rooms in the copy's schedule template, by their mark: its main room named, the others made. */
async function writeRooms(
  db: TransactionClient,
  rooms: SourceRoom[],
  scheduleTemplateId: number,
  congregationId: number,
): Promise<Map<string, number>> {
  const ids = new Map<string, number>()
  for (const room of new Map(rooms.map(each => [markOf(each), each])).values()) {
    if (room.key === 'main') {
      const main = await db.scheduleTemplateRoom.findFirstOrThrow({
        where: { scheduleTemplateId, key: 'main', congregationId },
      })
      if (room.name != null) {
        await db.scheduleTemplateRoom.update({
          where: { id_congregationId: { id: main.id, congregationId } },
          data: { name: room.name },
        })
      }
      ids.set(markOf(room), main.id)
    } else if (room.name != null) {
      const made = await db.scheduleTemplateRoom.upsert({
        where: { scheduleTemplateId_name: { scheduleTemplateId, name: room.name } },
        create: { name: room.name, order: room.order, scheduleTemplateId, congregationId },
        update: {},
      })
      ids.set(markOf(room), made.id)
    }
  }
  return ids
}
