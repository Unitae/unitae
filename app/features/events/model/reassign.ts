/** The two kinds of slot an event's page assigns from its side panel: a programme part and a service. */
export type AssignKind = 'part' | 'service'

export interface AssignTarget {
  kind: AssignKind
  id: number
}

/**
 * What the reader may do from an assignment falling during an absence. The event's page decides who fills a slot's
 * schedule (plan §10): « Attribuer » or « Gérer », or the responsible of that schedule's template.
 */
export interface ReassignRights {
  canViewPrograms: boolean
  /** « Attribuer » or « Gérer »: every schedule. */
  fillsEverySchedule: boolean
  /** The roles the reader holds, a schedule's responsible being one. */
  roleIds: readonly number[]
}

export type ConflictAction = 'reassign' | 'view'

/**
 * « Réattribuer » for whoever the event's page lets fill that slot, a plain link to the event for its other readers,
 * nothing for a reader of absences who cannot open the programmes (the link would only turn them away).
 */
export function conflictAction(
  slot: { responsibleRoleId: number | null },
  rights: ReassignRights,
): ConflictAction | null {
  if (!rights.canViewPrograms) return null
  if (rights.fillsEverySchedule) return 'reassign'
  // A schedule without a template has no responsible (D47).
  if (slot.responsibleRoleId == null) return 'view'
  return rights.roleIds.includes(slot.responsibleRoleId) ? 'reassign' : 'view'
}

/** `part-12`, `service-7`: an item's kind and id (plan T12). */
export function assignKey({ kind, id }: AssignTarget): string {
  return `${kind}-${id}`
}

const ASSIGN_KEY = /^(part|service)-([1-9]\d*)$/

/** The slot a `?item=` key names, or null for anything this page did not write. */
export function parseAssignKey(value: string): AssignTarget | null {
  const match = ASSIGN_KEY.exec(value)
  if (match == null) return null
  return { kind: match[1] as AssignKind, id: Number(match[2]) }
}

/** The event's page opened on the slot to reassign, or the event alone; null when there is nowhere to go. */
export function reassignHref(slot: AssignTarget & { eventId: number }, action: ConflictAction | null): string | null {
  if (action == null) return null
  const event = `/programs/events/${slot.eventId}`
  return action === 'reassign' ? `${event}?item=${assignKey(slot)}` : event
}
