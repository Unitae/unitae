import type { Prisma } from '~/database/generated/client'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import { ITEM_SLOT, type PartRoleKind } from '~/features/events/server/allowed-roles.server'
import { templateItemsOf } from '~/features/events/server/item-projection.server'
import type { CreatedProgramme, CreationContext } from '~/features/events/server/programme-creation.server'
import { eventSchedulesOf } from '~/features/events/server/schedules.server'
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
  serviceParts: { id: number; name: string; order: number; allowedRoles: { roleId: number }[] }[]
}

/** The template counts isAwaitingProgramme needs: whether it has a programme to give. */
export const TEMPLATE_PROGRAMME_COUNT = { _count: { select: { parts: true, serviceParts: true } } } as const

export const TEMPLATE_INCLUDE = {
  parts: { orderBy: { order: 'asc' }, include: { allowedRoles: true } },
  serviceParts: { orderBy: [{ order: 'asc' }, { id: 'asc' }], include: { allowedRoles: true } },
} satisfies Prisma.EventTemplateInclude

/**
 * Locks template rows before reading which days already have their events: in id order, like the recurring-events job,
 * so the two never wait on each other in a cycle. There is no unique key on (template, day).
 */
export async function lockTemplates(db: TransactionClient, templateIds: number[], congregationId: number) {
  await db.$queryRaw`SELECT "id" FROM "EventTemplate" WHERE "id" = ANY(${templateIds}) AND "congregationId" = ${congregationId} ORDER BY "id" FOR UPDATE`
}

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
  // Each item goes into the event's schedule of its kind, made from the template's.
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
    { partIds: template.parts.map(part => part.id), serviceIds: template.serviceParts.map(service => service.id) },
    congregationId,
  )
  for (const part of template.parts) {
    const assignment = await db.item.create({
      data: {
        eventId: event.id,
        scheduleId: programmeId,
        templateItemId: templates.parts.get(part.id) ?? null,
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
      await db.itemAllowedRole.createMany({
        data: part.allowedRoles.map(role => ({
          itemId: assignment.id,
          roleId: role.roleId,
          slot: ITEM_SLOT[role.asKind as PartRoleKind],
          congregationId,
        })),
        skipDuplicates: true,
      })
    }
  }

  for (const service of template.serviceParts) {
    const assignment = await db.item.create({
      data: {
        eventId: event.id,
        scheduleId: dutiesId,
        templateItemId: templates.services.get(service.id) ?? null,
        name: service.name,
        order: service.order,
        congregationId,
      },
    })
    if (service.allowedRoles.length > 0) {
      await db.itemAllowedRole.createMany({
        data: service.allowedRoles.map(role => ({
          itemId: assignment.id,
          slot: 'main',
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
