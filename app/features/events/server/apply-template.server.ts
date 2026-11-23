import { ScheduleKind } from '~/features/events/model/schedule.type'
import { ITEM_SLOT, type PartRoleKind } from '~/features/events/server/allowed-roles.server'
import { templateItemsOf } from '~/features/events/server/item-projection.server'
import { syncTemplateScheduleTemplates } from '~/features/events/server/schedule-templates.server'
import { alignEventSchedules, eventSchedulesOf } from '~/features/events/server/schedules.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

/** Points an event at another template and appends that template's parts and services, with who may take each. */
export async function applyTemplateToEvent(
  db: TransactionClient,
  eventId: number,
  templateId: number,
  congregationId: number,
  userId: number,
) {
  const template = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: { allowedRoles: true },
      },
      serviceParts: { orderBy: [{ order: 'asc' }, { id: 'asc' }], include: { allowedRoles: true } },
    },
  })
  if (!template) return null

  // The template's schedule templates first, which locks its row: a template before an event, as every path does.
  await syncTemplateScheduleTemplates(db, templateId, congregationId)
  await db.event.update({
    where: {
      id_congregationId: { id: eventId, congregationId },
    },
    data: { templateId },
  })
  // Its schedules follow it onto the new template, and the template's items go into them.
  await alignEventSchedules(db, eventId, congregationId)
  const kinds = [
    ...(template.parts.length > 0 ? [ScheduleKind.Programme] : []),
    ...(template.serviceParts.length > 0 ? [ScheduleKind.Duty] : []),
  ]
  const { programme: programmeId = null, duty: dutiesId = null } = await eventSchedulesOf(
    db,
    eventId,
    kinds,
    congregationId,
  )

  // Each item points at the template item its template part or service is mirrored into (plan T12).
  const templates = await templateItemsOf(
    db,
    { partIds: template.parts.map(part => part.id), serviceIds: template.serviceParts.map(role => role.id) },
    congregationId,
  )
  for (const part of template.parts) {
    const assignment = await db.item.create({
      data: {
        eventId,
        scheduleId: programmeId,
        templateItemId: templates.parts.get(part.id) ?? null,
        name: part.name,
        section: part.section,
        track: part.track,
        order: part.order,
        durationMin: part.durationMin,
        allowExternalSpeaker: part.allowExternalSpeaker,
        speakerLabel: part.speakerLabel,
        readerLabel: part.readerLabel,
        presetId: part.presetId,
        congregationId,
      },
    })
    if (part.allowedRoles.length > 0) {
      await db.itemAllowedRole.createMany({
        data: part.allowedRoles.map(r => ({
          itemId: assignment.id,
          roleId: r.roleId,
          slot: ITEM_SLOT[r.asKind as PartRoleKind],
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  for (const role of template.serviceParts) {
    const assignment = await db.item.create({
      data: {
        eventId,
        scheduleId: dutiesId,
        templateItemId: templates.services.get(role.id) ?? null,
        name: role.name,
        presetId: role.presetId,
        order: role.order,
        congregationId,
      },
    })
    if (role.allowedRoles.length > 0) {
      await db.itemAllowedRole.createMany({
        data: role.allowedRoles.map(r => ({
          itemId: assignment.id,
          slot: 'main',
          roleId: r.roleId,
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  logger.info(`Applied template ${templateId} to event ${eventId}. User ID: ${userId}.`)
  return template
}
