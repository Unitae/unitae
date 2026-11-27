import { ScheduleKind } from '~/features/events/model/schedule.type'
import { scheduleTemplateNameTaken } from '~/features/events/server/create-schedule-template.server'
import { setTemplatePartRooms } from '~/features/events/server/template-rooms.server'
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * « Dupliquer » on a schedule template (user, 2026-11-27): another template of its sort and responsible, used by no type
 * yet, with copies of its parts — section, labels, kind, who may take each, the rooms each is held in — or of its
 * services and who may take each. Every copy is the new template's own (template-owner.ts); the source is left as it
 * was. Named « … (copie) », or « … (copie 2) » and on when that name is taken. Null for a template it cannot read.
 */
export async function duplicateScheduleTemplate(
  db: TransactionClient,
  scheduleTemplateId: number,
  congregationId: number,
  actorId: number,
): Promise<{ id: number } | null> {
  const source = await db.scheduleTemplate.findFirst({
    where: { id: scheduleTemplateId, congregationId },
    include: {
      rooms: { orderBy: [{ order: 'asc' }, { id: 'asc' }] },
      parts: {
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        include: { allowedRoles: true, rooms: { select: { roomId: true } } },
      },
      serviceParts: { orderBy: [{ order: 'asc' }, { id: 'asc' }], include: { allowedRoles: true } },
    },
  })
  if (source == null) return null

  const name = await copyName(db, source, congregationId)
  const { id } = await db.scheduleTemplate.create({
    data: { name, kind: source.kind, responsibleRoleId: source.responsibleRoleId, congregationId },
    select: { id: true },
  })
  const roomIds = await copyRooms(db, source.rooms, id, congregationId)

  for (const part of source.parts) {
    const copy = await db.templatePart.create({
      data: {
        name: part.name,
        section: part.section,
        track: part.track,
        trackOrder: part.trackOrder,
        order: part.order,
        durationMin: part.durationMin,
        allowExternalSpeaker: part.allowExternalSpeaker,
        speakerLabel: part.speakerLabel,
        readerLabel: part.readerLabel,
        presetId: part.presetId,
        templateId: null,
        scheduleTemplateId: id,
        congregationId,
      },
    })
    if (part.allowedRoles.length > 0) {
      await db.templatePartAllowedRole.createMany({
        data: part.allowedRoles.map(role => ({
          partId: copy.id,
          roleId: role.roleId,
          asKind: role.asKind,
          congregationId,
        })),
      })
    }
    // Its rooms as the source's: the part comes with the main room alone (its trigger), the rest is set over it.
    const held = part.rooms.flatMap(row => roomIds.get(row.roomId) ?? [])
    if (held.length > 0) await setTemplatePartRooms(db, id, copy.id, held, congregationId)
  }
  for (const service of source.serviceParts) {
    const copy = await db.templateServicePart.create({
      data: {
        name: service.name,
        key: `${service.key}-copy-${Date.now()}`,
        order: service.order,
        templateId: null,
        scheduleTemplateId: id,
        congregationId,
      },
    })
    if (service.allowedRoles.length > 0) {
      await db.templateServicePartAllowedRole.createMany({
        data: service.allowedRoles.map(role => ({ servicePartId: copy.id, roleId: role.roleId, congregationId })),
      })
    }
  }

  await auditInTransaction(db, {
    action: AuditAction.ScheduleTemplateCreated,
    congregationId,
    actorId,
    entityType: 'ScheduleTemplate',
    entityId: id,
    metadata: { name, kind: source.kind, responsibleRoleId: source.responsibleRoleId, from: scheduleTemplateId },
  })
  return { id }
}

/** « Visite (copie) », or « Visite (copie 2) » and on: two templates of one name could not be told apart (#660). */
async function copyName(
  db: TransactionClient,
  source: { name: string | null; kind: string },
  congregationId: number,
): Promise<string> {
  // An unnamed template reads as its sort's label, as the list shows it.
  const title =
    source.name ??
    (source.kind === ScheduleKind.Duty ? m.programs_schedule_kind_duty() : m.programs_schedule_kind_programme())
  const first = m.events_template_copy_name({ name: title })
  if (!(await scheduleTemplateNameTaken(db, first, congregationId))) return first
  for (let number = 2; ; number++) {
    const next = m.events_template_copy_name_nth({ name: title, number })
    if (!(await scheduleTemplateNameTaken(db, next, congregationId))) return next
  }
}

/**
 * The source's rooms in the copy, by the source room's id: its main room (made with the template, the
 * ScheduleTemplate_rooms trigger) takes the source's name, the others are made in their order.
 */
async function copyRooms(
  db: TransactionClient,
  rooms: { id: number; key: string | null; name: string | null; order: number }[],
  scheduleTemplateId: number,
  congregationId: number,
): Promise<Map<number, number>> {
  const ids = new Map<number, number>()
  for (const room of rooms) {
    if (room.key === 'main') {
      const main = await db.scheduleTemplateRoom.findFirst({
        where: { scheduleTemplateId, key: 'main', congregationId },
      })
      if (main == null) continue
      if (room.name != null) {
        await db.scheduleTemplateRoom.update({
          where: { id_congregationId: { id: main.id, congregationId } },
          data: { name: room.name },
        })
      }
      ids.set(room.id, main.id)
    } else {
      const made = await db.scheduleTemplateRoom.create({
        data: { name: room.name, key: room.key, order: room.order, scheduleTemplateId, congregationId },
      })
      ids.set(room.id, made.id)
    }
  }
  return ids
}
