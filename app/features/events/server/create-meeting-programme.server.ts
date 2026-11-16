import { isSystemTemplate } from '~/features/events/model/event-template.type'
import { giveProgramme, lockTemplates, TEMPLATE_INCLUDE } from '~/features/events/server/give-programme.server'
import {
  type CreatedProgramme,
  type CreationContext,
  ProgrammeExistsError,
} from '~/features/events/server/programme-creation.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { dayOf } from '~/shared/utils/calendar-day'

/**
 * « Créer le programme » on a meeting waiting for one: its template's parts and services are copied onto it, the same
 * copy as a series filling a meeting created ahead. The meeting keeps its name and hours — someone may have moved that
 * week's — and whoever creates the programme becomes the one who prepared it. Null when there is nothing to fill: no
 * such event, no template, a system one, or a template with neither parts nor services.
 */
export async function createMeetingProgramme(
  db: TransactionClient,
  eventId: number,
  ctx: CreationContext,
): Promise<CreatedProgramme | null> {
  const { congregationId } = ctx
  const where = { id: eventId, congregationId }
  const found = await db.event.findFirst({ where, select: { templateId: true } })
  if (found?.templateId == null) return null
  await lockTemplates(db, [found.templateId], congregationId)

  // Read again under the lock: a second click waits here, then finds the programme the first one gave.
  const event = await db.event.findFirst({
    where,
    select: {
      id: true,
      templateId: true,
      startDate: true,
      createdById: true,
      _count: { select: { eventParts: true, eventServiceParts: true } },
    },
  })
  if (event?.templateId == null) return null
  const template = await db.eventTemplate.findFirst({
    where: { id: event.templateId, congregationId },
    include: TEMPLATE_INCLUDE,
  })
  if (template == null || (template.key != null && isSystemTemplate(template.key))) return null
  if (template.parts.length === 0 && template.serviceParts.length === 0) return null
  if (event._count.eventParts > 0 || event._count.eventServiceParts > 0) throw new ProgrammeExistsError(event.id)

  if (event.createdById == null) {
    await db.event.update({
      where: { id_congregationId: { id: event.id, congregationId } },
      data: { createdById: ctx.actorId },
    })
  }
  return giveProgramme(db, template, event.id, dayOf(event.startDate, ctx.timezone), ctx, { reused: true })
}
