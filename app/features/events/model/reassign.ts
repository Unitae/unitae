/** The two kinds of slot an event's page assigns from its side panel: a programme part and a service. */
export type AssignKind = 'part' | 'service'

export interface AssignTarget {
  kind: AssignKind
  id: number
}

/**
 * What the reader may do from an assignment falling during an absence. The event's page decides who fills a slot: the
 * right to assign parts, or the responsible of the event's template — for a service, a service responsible too.
 */
export interface ReassignRights {
  canViewPrograms: boolean
  canAssignParts: boolean
  /** The templates whose whole programme the reader is responsible for. */
  partTemplateIds: number[]
  /** The templates whose services the reader is responsible for, the whole-programme ones included. */
  serviceTemplateIds: number[]
}

export type ConflictAction = 'reassign' | 'view'

/**
 * « Réattribuer » for whoever the event's page lets fill that slot, a plain link to the event for its other readers,
 * nothing for a reader of absences who cannot open the programmes (the link would only turn them away).
 */
export function conflictAction(
  slot: { kind: AssignKind; templateId: number | null },
  rights: ReassignRights,
): ConflictAction | null {
  if (!rights.canViewPrograms) return null
  if (rights.canAssignParts) return 'reassign'
  if (slot.templateId == null) return 'view'
  const templates = slot.kind === 'part' ? rights.partTemplateIds : rights.serviceTemplateIds
  return templates.includes(slot.templateId) ? 'reassign' : 'view'
}

/** `part-12`, `service-7`: the two kinds' ids come from different tables. */
export function assignKey({ kind, id }: AssignTarget): string {
  return `${kind}-${id}`
}

const ASSIGN_KEY = /^(part|service)-([1-9]\d*)$/

/** The slot a `?assign=` key names, or null for anything this page did not write. */
export function parseAssignKey(value: string): AssignTarget | null {
  const match = ASSIGN_KEY.exec(value)
  if (match == null) return null
  return { kind: match[1] as AssignKind, id: Number(match[2]) }
}

/** The event's page opened on the slot to reassign, or the event alone; null when there is nowhere to go. */
export function reassignHref(slot: AssignTarget & { eventId: number }, action: ConflictAction | null): string | null {
  if (action == null) return null
  const event = `/programs/events/${slot.eventId}`
  return action === 'reassign' ? `${event}?assign=${assignKey(slot)}` : event
}
