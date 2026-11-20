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

  await db.event.update({
    where: {
      id_congregationId: { id: eventId, congregationId },
    },
    data: { templateId },
  })

  for (const part of template.parts) {
    const assignment = await db.eventPart.create({
      data: {
        eventId,
        partId: part.id,
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
      await db.eventPartAllowedRole.createMany({
        data: part.allowedRoles.map(r => ({
          eventPartId: assignment.id,
          roleId: r.roleId,
          asKind: r.asKind,
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  for (const role of template.serviceParts) {
    const assignment = await db.eventServicePart.create({
      data: {
        eventId,
        servicePartId: role.id,
        name: role.name,
        presetId: role.presetId,
        order: role.order,
        congregationId,
      },
    })
    if (role.allowedRoles.length > 0) {
      await db.eventServicePartAllowedRole.createMany({
        data: role.allowedRoles.map(r => ({
          eventServicePartId: assignment.id,
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
