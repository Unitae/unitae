import { normalize, type PartSlot } from '~/features/events/server/cadence-shared.server'
import {
  PART_ITEMS,
  PART_TIE_BREAK,
  SERVICE_ITEMS,
  SERVICE_TIE_BREAK,
} from '~/features/events/server/item-projection.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/** The slot being assigned: one of a part's two people, or a service. */
export type SlotTarget =
  | {
      kind: 'part'
      assignmentId: number
      partName: string
      partSection: string
      slot: PartSlot
      /** The room being assigned (parallel rooms); none, its only or main room. */
      roomId?: number | null
    }
  | { kind: 'service'; assignmentId: number; serviceName: string }

// A part's people are its rows' (parallel rooms R4 writes them there alone): each room is a line, a part read before
// rooms (no row) is a line of its own.
const ROOM_PEOPLE = {
  rooms: {
    select: {
      roomId: true,
      assigneeId: true,
      assistantId: true,
      externalSpeakerId: true,
      room: { select: { key: true } },
    },
  },
} as const

interface RoomLine {
  roomId: number | null
  isMain: boolean
  assigneeId: number | null
  assistantId: number | null
  externalSpeakerId: number | null
}

type WithRooms = {
  assigneeId?: number | null
  assistantId?: number | null
  externalSpeakerId?: number | null
  rooms: {
    roomId: number
    assigneeId: number | null
    assistantId: number | null
    externalSpeakerId: number | null
    room: { key: string | null }
  }[]
}

function linesOf(item: WithRooms): RoomLine[] {
  if (item.rooms.length === 0) {
    return [
      {
        roomId: null,
        isMain: true,
        assigneeId: item.assigneeId ?? null,
        assistantId: item.assistantId ?? null,
        externalSpeakerId: item.externalSpeakerId ?? null,
      },
    ]
  }
  return item.rooms.map(row => ({ ...row, room: undefined, isMain: row.room.key === 'main' }))
}

/** Whether a line is the room being assigned: that room, or (none named) the part's only or main room. */
function isEdited(item: { id: number }, lines: RoomLine[], line: RoomLine, target: SlotTarget): boolean {
  if (target.kind !== 'part' || item.id !== target.assignmentId) return false
  if (target.roomId != null) return line.roomId === target.roomId
  return lines.length <= 1 || line.isMain
}

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
  /** The same for external speakers, by speaker id. Empty for a slot they cannot take (a second speaker, a service). */
  speakers: { lastAssignedAt: Record<number, string>; elsewhere: Record<number, string[]> }
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
  const [lastAssignedAt, absences, elsewhere, speakers] = await Promise.all([
    lastTimeOnSlot(db, event, congregationId, target),
    absencesOverEvent(db, event, congregationId),
    alreadyAtEvent(db, event, congregationId, target),
    speakerFacts(db, event, congregationId, target),
  ])
  return { lastAssignedAt, absences, elsewhere, speakers }
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
  // A turn in any room is a turn on the part.
  const rows = await db.item.findMany({
    where: {
      ...PART_ITEMS,
      congregationId: past.congregationId,
      event: past,
      OR: [{ [field]: { not: null } }, { rooms: { some: { [field]: { not: null } } } }],
    },
    select: {
      name: true,
      section: true,
      assigneeId: true,
      assistantId: true,
      event: { select: { startDate: true } },
      ...ROOM_PEOPLE,
    },
  })
  const name = normalize(target.partName)
  const section = normalize(target.partSection)
  return rows.flatMap(row => {
    if (normalize(row.name) !== name || normalize(row.section) !== section) return []
    return linesOf(row).flatMap(line => {
      const memberId = line[field]
      return memberId == null ? [] : [{ memberId, date: row.event.startDate }]
    })
  })
}

async function heldService(
  db: TransactionClient,
  past: PastEvents,
  target: Extract<SlotTarget, { kind: 'service' }>,
): Promise<{ memberId: number; date: Date }[]> {
  const rows = await db.item.findMany({
    where: { ...SERVICE_ITEMS, congregationId: past.congregationId, event: past, assigneeId: { not: null } },
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
  const rows = await db.absence.findMany({
    where: {
      congregationId,
      startDate: { lte: event.endDate },
      endDate: { gte: event.startDate },
      memberId: { not: null },
    },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    select: { startDate: true, endDate: true, memberId: true },
  })
  const absences: SlotCandidateFacts['absences'] = {}
  for (const row of rows) {
    const memberId = row.memberId
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
  // The room being assigned is left out whole, as listUserSameEventAssignments does: the person in its other slot is
  // not « elsewhere »; another room of the same part is (parallel rooms).
  const [parts, services] = await Promise.all([
    db.item.findMany({
      where: { ...PART_ITEMS, eventId: event.id, congregationId },
      orderBy: [{ order: 'asc' }, ...PART_TIE_BREAK],
      select: { id: true, name: true, assigneeId: true, assistantId: true, ...ROOM_PEOPLE },
    }),
    db.item.findMany({
      where: {
        ...SERVICE_ITEMS,
        eventId: event.id,
        congregationId,
        ...(target.kind === 'service' ? { NOT: { id: target.assignmentId } } : {}),
      },
      orderBy: SERVICE_TIE_BREAK,
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
    const lines = linesOf(part)
    for (const line of lines) {
      if (isEdited(part, lines, line, target)) continue
      add(line.assigneeId, part.name)
      add(line.assistantId, part.name)
    }
  }
  for (const service of services) add(service.assigneeId, service.name)
  return elsewhere
}

/** External speakers on the main slot of a part: when each last gave it, and what else each gives at the event. */
async function speakerFacts(
  db: TransactionClient,
  event: Options['event'],
  congregationId: number,
  target: SlotTarget,
): Promise<SlotCandidateFacts['speakers']> {
  const none = { lastAssignedAt: {}, elsewhere: {} }
  if (target.kind !== 'part' || target.slot !== 'assignee') return none

  const [past, current] = await Promise.all([
    event.templateId == null
      ? []
      : db.item.findMany({
          where: {
            ...PART_ITEMS,
            congregationId,
            OR: [{ externalSpeakerId: { not: null } }, { rooms: { some: { externalSpeakerId: { not: null } } } }],
            event: { templateId: event.templateId, congregationId, startDate: { lt: event.startDate } },
          },
          select: {
            name: true,
            section: true,
            externalSpeakerId: true,
            event: { select: { startDate: true } },
            ...ROOM_PEOPLE,
          },
        }),
    db.item.findMany({
      where: {
        ...PART_ITEMS,
        eventId: event.id,
        congregationId,
        OR: [{ externalSpeakerId: { not: null } }, { rooms: { some: { externalSpeakerId: { not: null } } } }],
      },
      orderBy: [{ order: 'asc' }, ...PART_TIE_BREAK],
      select: { id: true, name: true, externalSpeakerId: true, ...ROOM_PEOPLE },
    }),
  ])

  return {
    lastAssignedAt: lastGiven(past, normalize(target.partName), normalize(target.partSection)),
    elsewhere: speakersElsewhere(current, target),
  }
}

/** When each outside speaker last gave the part, in any room. */
function lastGiven(
  past: (WithRooms & { name: string; section: string; event: { startDate: Date } })[],
  name: string,
  section: string,
): Record<number, string> {
  const lastAssignedAt: Record<number, string> = {}
  for (const row of past) {
    if (normalize(row.name) !== name || normalize(row.section) !== section) continue
    const iso = row.event.startDate.toISOString()
    for (const { externalSpeakerId } of linesOf(row)) {
      if (externalSpeakerId == null) continue
      const known = lastAssignedAt[externalSpeakerId]
      if (known == null || known < iso) lastAssignedAt[externalSpeakerId] = iso
    }
  }
  return lastAssignedAt
}

/** What else each outside speaker gives at the event, the room being assigned left out. */
function speakersElsewhere(current: (WithRooms & { id: number; name: string })[], target: SlotTarget) {
  const elsewhere: Record<number, string[]> = {}
  for (const row of current) {
    const lines = linesOf(row)
    for (const line of lines) {
      if (line.externalSpeakerId == null || isEdited(row, lines, line, target)) continue
      elsewhere[line.externalSpeakerId] = [...(elsewhere[line.externalSpeakerId] ?? []), row.name]
    }
  }
  return elsewhere
}
