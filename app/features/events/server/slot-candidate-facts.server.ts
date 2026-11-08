import { EventTemplateKey } from '~/features/events/model/event-template.type'
import { normalize, type PartSlot } from '~/features/events/server/cadence-shared.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/** The slot being assigned: one of a part's two people, or a service. */
export type SlotTarget =
  | { kind: 'part'; assignmentId: number; partName: string; partSection: string; slot: PartSlot }
  | { kind: 'service'; assignmentId: number; serviceName: string }

/**
 * What can be said about each person before picking one for a slot. A member missing from a map has nothing to
 * say there: never held the slot, no absence declared, nothing else at the event.
 */
export interface SlotCandidateFacts {
  /** When each member last held this slot on a past event of the same template (ISO). */
  lastAssignedAt: Record<number, string>
  /** The declared absence that covers the event. A member without an account cannot have declared one. */
  absences: Record<number, { startDate: string; endDate: string }>
  /** What each member already does at this event, the slot being edited left out. */
  elsewhere: Record<number, string[]>
}

interface Options {
  event: { id: number; templateId: number | null; startDate: Date; endDate: Date }
  congregationId: number
  target: SlotTarget
}

/**
 * The facts for every member at once, for the list of people to pick from. The slot is matched as the cadence
 * helpers match it — the same template, a name (and for a part, a section) equal once trimmed and stripped of
 * case and accents — so the list and the facts under the chosen person never disagree.
 */
export async function listSlotCandidateFacts(
  db: TransactionClient,
  { event, congregationId, target }: Options,
): Promise<SlotCandidateFacts> {
  const [lastAssignedAt, absences, elsewhere] = await Promise.all([
    lastTimeOnSlot(db, event, congregationId, target),
    absencesOverEvent(db, event, congregationId),
    alreadyAtEvent(db, event, congregationId, target),
  ])
  return { lastAssignedAt, absences, elsewhere }
}

async function lastTimeOnSlot(
  db: TransactionClient,
  event: Options['event'],
  congregationId: number,
  target: SlotTarget,
): Promise<Record<number, string>> {
  if (event.templateId == null) return {}
  const past = { templateId: event.templateId, congregationId, startDate: { lt: event.startDate } }
  const held = target.kind === 'part' ? await heldPart(db, past, target) : await heldService(db, past, target)

  const latest: Record<number, string> = {}
  for (const { memberId, date } of held) {
    const iso = date.toISOString()
    if (latest[memberId] == null || latest[memberId] < iso) latest[memberId] = iso
  }
  return latest
}

type PastEvents = { templateId: number; congregationId: number; startDate: { lt: Date } }

async function heldPart(
  db: TransactionClient,
  past: PastEvents,
  target: Extract<SlotTarget, { kind: 'part' }>,
): Promise<{ memberId: number; date: Date }[]> {
  const field = target.slot === 'assignee' ? 'assigneeId' : 'assistantId'
  const rows = await db.eventPart.findMany({
    where: { congregationId: past.congregationId, event: past, [field]: { not: null } },
    select: { name: true, section: true, assigneeId: true, assistantId: true, event: { select: { startDate: true } } },
  })
  const name = normalize(target.partName)
  const section = normalize(target.partSection)
  return rows.flatMap(row => {
    const memberId = row[field]
    const matches = memberId != null && normalize(row.name) === name && normalize(row.section) === section
    return matches ? [{ memberId, date: row.event.startDate }] : []
  })
}

async function heldService(
  db: TransactionClient,
  past: PastEvents,
  target: Extract<SlotTarget, { kind: 'service' }>,
): Promise<{ memberId: number; date: Date }[]> {
  const rows = await db.eventServicePart.findMany({
    where: { congregationId: past.congregationId, event: past, assigneeId: { not: null } },
    select: { name: true, assigneeId: true, event: { select: { startDate: true } } },
  })
  const name = normalize(target.serviceName)
  return rows.flatMap(row =>
    row.assigneeId != null && normalize(row.name) === name
      ? [{ memberId: row.assigneeId, date: row.event.startDate }]
      : [],
  )
}

async function absencesOverEvent(
  db: TransactionClient,
  event: Options['event'],
  congregationId: number,
): Promise<SlotCandidateFacts['absences']> {
  const rows = await db.event.findMany({
    where: {
      congregationId,
      template: { key: EventTemplateKey.DayOff },
      startDate: { lte: event.endDate },
      endDate: { gte: event.startDate },
      createdBy: { memberId: { not: null } },
    },
    orderBy: { startDate: 'asc' },
    select: { startDate: true, endDate: true, createdBy: { select: { memberId: true } } },
  })
  const absences: SlotCandidateFacts['absences'] = {}
  for (const row of rows) {
    const memberId = row.createdBy.memberId
    if (memberId != null && absences[memberId] == null) {
      absences[memberId] = { startDate: row.startDate.toISOString(), endDate: row.endDate.toISOString() }
    }
  }
  return absences
}

async function alreadyAtEvent(
  db: TransactionClient,
  event: Options['event'],
  congregationId: number,
  target: SlotTarget,
): Promise<SlotCandidateFacts['elsewhere']> {
  // The whole edited row is left out, as listUserSameEventAssignments does: the person in the other slot of the
  // same part is not « elsewhere ».
  const [parts, services] = await Promise.all([
    db.eventPart.findMany({
      where: {
        eventId: event.id,
        congregationId,
        ...(target.kind === 'part' ? { id: { not: target.assignmentId } } : {}),
      },
      orderBy: { order: 'asc' },
      select: { name: true, assigneeId: true, assistantId: true },
    }),
    db.eventServicePart.findMany({
      where: {
        eventId: event.id,
        congregationId,
        ...(target.kind === 'service' ? { id: { not: target.assignmentId } } : {}),
      },
      orderBy: { id: 'asc' },
      select: { name: true, assigneeId: true },
    }),
  ])

  const elsewhere: SlotCandidateFacts['elsewhere'] = {}
  const add = (memberId: number | null, name: string) => {
    if (memberId == null) return
    const names = elsewhere[memberId] ?? []
    if (!names.includes(name)) elsewhere[memberId] = [...names, name]
  }
  for (const part of parts) {
    add(part.assigneeId, part.name)
    add(part.assistantId, part.name)
  }
  for (const service of services) add(service.assigneeId, service.name)
  return elsewhere
}
