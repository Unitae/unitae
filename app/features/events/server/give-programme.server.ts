import type { CreatedProgramme, CreationContext } from '~/features/events/server/programme-creation.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// Copying a template's programme onto an event: used when a programme is created, and when an empty meeting created
// ahead receives its programme.

export interface TemplateWithRelations {
  id: number
  name: string
  weekDay: number | null
  /** How far the template's events exist or were left out on purpose (see recurring-events). */
  generatedUntil?: string | null
  startTime: string
  endTime: string
  parts: {
    id: number
    name: string
    section: string
    track: string
    trackOrder: number | null
    order: number
    durationMin: number | null
    allowExternalSpeaker: boolean
    speakerLabel: string | null
    readerLabel: string | null
    presetId: number | null
    allowedRoles: { roleId: number; asKind: string }[]
  }[]
  serviceParts: { id: number; name: string; allowedRoles: { roleId: number }[] }[]
}

export const TEMPLATE_INCLUDE = {
  parts: { orderBy: { order: 'asc' }, include: { allowedRoles: true } },
  serviceParts: { include: { allowedRoles: true } },
} as const

/**
 * Gives an event its template's programme: its parts in order and its services, with who may take each. Used on a new
 * event, and on a meeting the recurring-events job created ahead with no programme yet, which is reused rather than
 * doubled.
 */
export async function giveProgramme(
  db: TransactionClient,
  template: TemplateWithRelations,
  eventId: number,
  day: string,
  ctx: CreationContext,
  { reused = false }: { reused?: boolean } = {},
): Promise<CreatedProgramme> {
  const { congregationId } = ctx
  const event = { id: eventId }
  for (const part of template.parts) {
    const assignment = await db.eventPart.create({
      data: {
        eventId: event.id,
        partId: part.id,
        name: part.name,
        section: part.section,
        track: part.track,
        trackOrder: part.trackOrder,
        order: part.order,
        durationMin: part.durationMin,
        allowExternalSpeaker: part.allowExternalSpeaker,
        speakerLabel: part.speakerLabel,
        readerLabel: part.readerLabel,
        // Carried, not denormalized-and-frozen like the labels above: the preset row itself stays the source of
        // truth for the share message, so an improved wording reaches assignments that already exist.
        presetId: part.presetId,
        congregationId,
      },
    })
    if (part.allowedRoles.length > 0) {
      await db.eventPartAllowedRole.createMany({
        data: part.allowedRoles.map(role => ({
          eventPartId: assignment.id,
          roleId: role.roleId,
          asKind: role.asKind,
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  for (const service of template.serviceParts) {
    const assignment = await db.eventServicePart.create({
      data: { eventId: event.id, servicePartId: service.id, name: service.name, congregationId },
    })
    if (service.allowedRoles.length > 0) {
      await db.eventServicePartAllowedRole.createMany({
        data: service.allowedRoles.map(role => ({
          eventServicePartId: assignment.id,
          roleId: role.roleId,
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  // Awaited, in the same transaction: the record of who created it stands or falls with the programme.
  await auditInTransaction(db, {
    action: AuditAction.EventCreated,
    congregationId,
    actorId: ctx.actorId,
    entityType: 'Event',
    entityId: event.id,
    // `reused`: the meeting existed, created ahead; this gave it its programme.
    metadata: reused ? { templateId: template.id, day, reused: true } : { templateId: template.id, day },
  })
  return { id: event.id, templateId: template.id, day }
}
