import {
  getPartAssignmentAllowedRoleIdsForParts,
  getServicePartAssignmentAllowedRoleIdsForParts,
} from '~/features/events/server/allowed-roles.queries'
import { resolveEligibleUserIds } from '~/features/events/server/allowed-roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface AssignmentCandidates {
  partCandidates: Record<number, { speakerIds: number[]; readerIds: number[] }>
  serviceCandidates: Record<number, number[]>
}

/**
 * Who may be offered for each slot on an event.
 *
 * The result is intersected with the member list the page loaded, so the picker
 * can only offer people the form is able to render. Both sides already exclude
 * members who have left, so in practice the intersection is a narrowing rather
 * than a correction — it keeps the two lists from drifting apart if either
 * filter changes.
 *
 * Speaker and reader are resolved separately because a part may allow different
 * roles for each.
 */
export async function buildAssignmentCandidates(
  db: TransactionClient,
  event: { eventParts: { id: number }[]; eventServiceParts: { id: number }[] },
  members: { id: number }[],
  congregationId: number,
): Promise<AssignmentCandidates> {
  const memberIds = new Set(members.map(member => member.id))
  const partCandidates: AssignmentCandidates['partCandidates'] = {}
  const serviceCandidates: AssignmentCandidates['serviceCandidates'] = {}

  const [partAllowed, serviceAllowed] = await Promise.all([
    getPartAssignmentAllowedRoleIdsForParts(
      db,
      event.eventParts.map(part => part.id),
      congregationId,
    ),
    getServicePartAssignmentAllowedRoleIdsForParts(
      db,
      event.eventServiceParts.map(part => part.id),
      congregationId,
    ),
  ])

  // Most slots on a programme restrict nobody, and the ones that do tend to
  // name the same role. Resolving per slot asked the database the same
  // question once per slot; keyed on the role set, it is asked once per
  // distinct answer.
  const eligibleByRoleSet = new Map<string, Promise<number[]>>()
  const eligibleFor = (allowedRoleIds: number[]): Promise<number[]> => {
    const key = [...allowedRoleIds].sort((a, b) => a - b).join(',')
    const cached = eligibleByRoleSet.get(key)
    if (cached) return cached
    const pending = resolveEligibleUserIds(db, allowedRoleIds, congregationId)
    eligibleByRoleSet.set(key, pending)
    return pending
  }

  const offerable = (ids: number[]) => ids.filter(id => memberIds.has(id))

  for (const assignment of event.eventParts) {
    const slots = partAllowed.get(assignment.id) ?? { speaker: [], reader: [] }
    const [speakerIds, readerIds] = await Promise.all([eligibleFor(slots.speaker), eligibleFor(slots.reader)])
    partCandidates[assignment.id] = { speakerIds: offerable(speakerIds), readerIds: offerable(readerIds) }
  }

  for (const assignment of event.eventServiceParts) {
    const eligible = await eligibleFor(serviceAllowed.get(assignment.id) ?? [])
    serviceCandidates[assignment.id] = offerable(eligible)
  }

  return { partCandidates, serviceCandidates }
}
