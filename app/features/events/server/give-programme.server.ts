import type { Prisma } from '~/database/generated/client'
import { roomLabel } from '~/features/events/model/part-places'
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
    /** The rooms it is held in (none read as the main room alone). */
    rooms?: { room: { name: string | null; key: string | null; order: number } }[]
  }[]
  serviceParts: { id: number; name: string; order: number; allowedRoles: { roleId: number }[] }[]
}

/**
 * The template counts isAwaitingProgramme needs: whether it has a programme to give, the items of the schedule
 * templates it uses (6b-0), theirs under no kind as well as its own.
 */
export const TEMPLATE_PROGRAMME_COUNT = {
  scheduleTemplates: {
    select: { scheduleTemplate: { select: { _count: { select: { parts: true, serviceParts: true } } } } },
  },
} as const

const PARTS = {
  orderBy: [{ order: 'asc' }, { id: 'asc' }],
  include: { allowedRoles: true, rooms: { include: { room: true } } },
} satisfies Prisma.EventTemplate$partsArgs
const SERVICES = {
  orderBy: [{ order: 'asc' }, { id: 'asc' }],
  include: { allowedRoles: true },
} satisfies Prisma.EventTemplate$servicePartsArgs

/**
 * What a new meeting of the kind copies (6b-0): the items of the schedule templates it uses, in their order, and any of
 * the kind's own not placed in one yet (its writers leave that to syncTemplateScheduleTemplates).
 */
export const TEMPLATE_INCLUDE = {
  parts: { ...PARTS, where: { scheduleTemplateId: null } },
  serviceParts: { ...SERVICES, where: { scheduleTemplateId: null } },
  scheduleTemplates: {
    orderBy: [{ order: 'asc' }, { scheduleTemplateId: 'asc' }],
    select: { scheduleTemplate: { select: { kind: true, parts: PARTS, serviceParts: SERVICES } } },
  },
} satisfies Prisma.EventTemplateInclude

type LoadedKind = Prisma.EventTemplateGetPayload<{ include: typeof TEMPLATE_INCLUDE }>

/**
 * A kind as loaded with TEMPLATE_INCLUDE, its items those of its first programme template and its first duties
 * template (an event holds one schedule of each sort) — that template's own and the kind's rows in it; another kind's
 * rows in a shared template are its own business — then the kind's not placed yet.
 */
export function kindTemplate<T extends LoadedKind>(loaded: T): Omit<T, 'scheduleTemplates'> & TemplateWithRelations {
  // A kind read without its links (an older caller, a test's stub) has only its own items.
  const { scheduleTemplates = [], ...kind } = loaded
  const first = (sort: string) => scheduleTemplates.find(link => link.scheduleTemplate.kind === sort)?.scheduleTemplate
  const ours = (item: { templateId: number | null }) => item.templateId == null || item.templateId === kind.id
  const byOrder = (a: { order: number; id: number }, b: { order: number; id: number }) =>
    a.order - b.order || a.id - b.id
  return {
    ...kind,
    parts: [...(first(ScheduleKind.Programme)?.parts.filter(ours) ?? []), ...kind.parts].sort(byOrder),
    serviceParts: [...(first(ScheduleKind.Duty)?.serviceParts.filter(ours) ?? []), ...kind.serviceParts].sort(byOrder),
  }
}

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
  const { programme: programmeId, duty: dutiesId } = await eventSchedulesOf(db, eventId, kinds, congregationId)
  await writeTemplateItems(
    db,
    { eventId: event.id, programmeId, dutiesId, parts: template.parts, services: template.serviceParts },
    congregationId,
  )

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

/**
 * Writes a template's parts into the event's programme schedule and its duties into its duty schedule, each with who
 * may take it: for giving a programme, and for adding one schedule from its template (addSchedule).
 */
export async function writeTemplateItems(
  db: TransactionClient,
  {
    eventId,
    programmeId,
    dutiesId,
    parts,
    services,
  }: {
    eventId: number
    programmeId: number | null
    dutiesId: number | null
    parts: TemplateWithRelations['parts']
    services: TemplateWithRelations['serviceParts']
  },
  congregationId: number,
) {
  // Each item points at the template item its template part or service is mirrored into (plan T12).
  const templates = await templateItemsOf(
    db,
    { partIds: parts.map(part => part.id), serviceIds: services.map(service => service.id) },
    congregationId,
  )
  for (const part of parts) {
    for (const place of placesOf(part)) {
      const assignment = await db.item.create({
        data: {
          eventId: eventId,
          scheduleId: programmeId,
          templateItemId: templates.parts.get(part.id) ?? null,
          name: part.name,
          section: part.section,
          track: place.track,
          trackOrder: place.trackOrder,
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
  }

  for (const service of services) {
    const assignment = await db.item.create({
      data: {
        eventId: eventId,
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
}

/**
 * Where a template part goes on a meeting: once for the whole congregation, or once per room it is held in, the copies
 * sharing its section and order (as the meeting page and the board read rooms until they read them from ItemRoom). A
 * main room without a name is written « Salle principale » in the writer's language, as the editor always wrote it.
 */
function placesOf(part: TemplateWithRelations['parts'][number]): { track: string; trackOrder: number | null }[] {
  const rooms = [...(part.rooms ?? [])].map(row => row.room).sort((a, b) => a.order - b.order)
  if (rooms.length <= 1)
    return [{ track: rooms.length === 0 ? part.track : '', trackOrder: rooms.length === 0 ? part.trackOrder : null }]
  return rooms.map(room => ({
    track: roomLabel({ name: room.name, isMain: room.key === 'main' }),
    trackOrder: room.order + 1,
  }))
}
