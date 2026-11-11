import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// What a role alone reserves. In each of these places an empty list of roles means "everyone": a board section no
// role restricts is read by all, a part or a service no role restricts may go to any publisher, a territory kind no
// role restricts may be held by anyone. Deleting a role removes it from every list it is on, so where it was the only
// one, the place opens to everyone without anybody deciding it. These are the places to settle first.

export interface SoleReservations {
  /** Board sections only this role may read. */
  sections: string[]
  /** Territory kinds only this role may hold; `name` is null for a built-in kind, labelled from its key. */
  territoryKinds: { key: string; name: string | null }[]
  /** Template parts and services only this role may take (per speaker or reader for a part). */
  templateSlots: { template: string; name: string }[]
  /** Parts and services of upcoming programmes only this role may take. */
  programmeSlots: number
}

export function hasSoleReservations(found: SoleReservations): boolean {
  return (
    found.sections.length > 0 ||
    found.territoryKinds.length > 0 ||
    found.templateSlots.length > 0 ||
    found.programmeSlots > 0
  )
}

/** The slots (ids, with the asKind of a part) where exactly one role is allowed. */
function soleSlotKeys(
  counts: { _count: { roleId: number }; asKind?: string | null }[],
  slotOf: (row: never) => number,
) {
  return new Set(
    counts.filter(row => row._count.roleId === 1).map(row => `${slotOf(row as never)}|${row.asKind ?? ''}`),
  )
}

const key = (slot: number, asKind?: string | null) => `${slot}|${asKind ?? ''}`

export async function findSoleReservations(
  db: TransactionClient,
  roleId: number,
  congregationId: number,
): Promise<SoleReservations> {
  const now = new Date()

  const sectionRows = await db.boardSectionVisibilityRole.findMany({
    where: { roleId, congregationId },
    select: { sectionId: true, section: { select: { name: true } } },
  })
  const sectionCounts = await db.boardSectionVisibilityRole.groupBy({
    by: ['sectionId'],
    where: { sectionId: { in: sectionRows.map(row => row.sectionId) }, congregationId },
    _count: { roleId: true },
  })
  const soleSections = soleSlotKeys(sectionCounts, (row: { sectionId: number }) => row.sectionId)

  const kindRows = await db.territoryKindAllowedRole.findMany({
    where: { roleId, congregationId },
    select: { kindId: true, kind: { select: { key: true, name: true } } },
  })
  const kindCounts = await db.territoryKindAllowedRole.groupBy({
    by: ['kindId'],
    where: { kindId: { in: kindRows.map(row => row.kindId) }, congregationId },
    _count: { roleId: true },
  })
  const soleKinds = soleSlotKeys(kindCounts, (row: { kindId: number }) => row.kindId)

  const partRows = await db.templatePartAllowedRole.findMany({
    where: { roleId, congregationId },
    select: { partId: true, asKind: true, part: { select: { name: true, template: { select: { name: true } } } } },
  })
  const partCounts = await db.templatePartAllowedRole.groupBy({
    by: ['partId', 'asKind'],
    where: { partId: { in: partRows.map(row => row.partId) }, congregationId },
    _count: { roleId: true },
  })
  const soleParts = soleSlotKeys(partCounts, (row: { partId: number }) => row.partId)

  const serviceRows = await db.templateServicePartAllowedRole.findMany({
    where: { roleId, congregationId },
    select: {
      servicePartId: true,
      servicePart: { select: { name: true, template: { select: { name: true } } } },
    },
  })
  const serviceCounts = await db.templateServicePartAllowedRole.groupBy({
    by: ['servicePartId'],
    where: { servicePartId: { in: serviceRows.map(row => row.servicePartId) }, congregationId },
    _count: { roleId: true },
  })
  const soleServices = soleSlotKeys(serviceCounts, (row: { servicePartId: number }) => row.servicePartId)

  const eventPartRows = await db.eventPartAllowedRole.findMany({
    where: { roleId, congregationId, eventPart: { event: { endDate: { gte: now } } } },
    select: { eventPartId: true, asKind: true },
  })
  const eventPartCounts = await db.eventPartAllowedRole.groupBy({
    by: ['eventPartId', 'asKind'],
    where: { eventPartId: { in: eventPartRows.map(row => row.eventPartId) }, congregationId },
    _count: { roleId: true },
  })
  const soleEventParts = soleSlotKeys(eventPartCounts, (row: { eventPartId: number }) => row.eventPartId)

  const eventServiceRows = await db.eventServicePartAllowedRole.findMany({
    where: { roleId, congregationId, eventServicePart: { event: { endDate: { gte: now } } } },
    select: { eventServicePartId: true },
  })
  const eventServiceCounts = await db.eventServicePartAllowedRole.groupBy({
    by: ['eventServicePartId'],
    where: { eventServicePartId: { in: eventServiceRows.map(row => row.eventServicePartId) }, congregationId },
    _count: { roleId: true },
  })
  const soleEventServices = soleSlotKeys(
    eventServiceCounts,
    (row: { eventServicePartId: number }) => row.eventServicePartId,
  )

  // A part restricted for both its speaker and its reader is one place to settle, named once.
  const templateParts = new Map<number, { template: string; name: string }>()
  for (const row of partRows) {
    if (soleParts.has(key(row.partId, row.asKind))) {
      templateParts.set(row.partId, { template: row.part.template.name, name: row.part.name })
    }
  }

  return {
    sections: sectionRows.filter(row => soleSections.has(key(row.sectionId))).map(row => row.section.name),
    territoryKinds: kindRows.filter(row => soleKinds.has(key(row.kindId))).map(row => row.kind),
    templateSlots: [
      ...templateParts.values(),
      ...serviceRows
        .filter(row => soleServices.has(key(row.servicePartId)))
        .map(row => ({ template: row.servicePart.template.name, name: row.servicePart.name })),
    ],
    programmeSlots:
      new Set(eventPartRows.filter(row => soleEventParts.has(key(row.eventPartId, row.asKind))).map(r => r.eventPartId))
        .size + eventServiceRows.filter(row => soleEventServices.has(key(row.eventServicePartId))).length,
  }
}

/** Raised when a role still alone reserves something: deleting it would open those places to everyone. */
export class RoleReservesError extends ConflictError {
  constructor(public readonly reservations: SoleReservations) {
    super('This role is the only one reserving some places')
  }
}
