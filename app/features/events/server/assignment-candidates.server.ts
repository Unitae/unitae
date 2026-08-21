import {
  getPartAssignmentAllowedRoleIds,
  getServicePartAssignmentAllowedRoleIds,
  resolveEligibleUserIds,
} from '~/features/events/server/allowed-roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface AssignmentCandidates {
  partCandidates: Record<number, { speakerIds: number[]; readerIds: number[] }>
  serviceCandidates: Record<number, number[]>
}

/**
 * Who may be offered for each slot on an event.
 *
 * Eligibility comes from roles, so it can name someone who has since left the
 * congregation; intersecting with the member list keeps the picker to people
 * the form can actually display. Speaker and reader are resolved separately
 * because a part may allow different roles for each.
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

  for (const assignment of event.eventParts) {
    const speakerAllowed = await getPartAssignmentAllowedRoleIds(db, assignment.id, 'speaker', congregationId)
    const readerAllowed = await getPartAssignmentAllowedRoleIds(db, assignment.id, 'reader', congregationId)
    const speakerIds = await resolveEligibleUserIds(db, speakerAllowed, congregationId)
    const readerIds = await resolveEligibleUserIds(db, readerAllowed, congregationId)
    partCandidates[assignment.id] = {
      speakerIds: speakerIds.filter(id => memberIds.has(id)),
      readerIds: readerIds.filter(id => memberIds.has(id)),
    }
  }

  for (const assignment of event.eventServiceParts) {
    const allowed = await getServicePartAssignmentAllowedRoleIds(db, assignment.id, congregationId)
    const eligible = await resolveEligibleUserIds(db, allowed, congregationId)
    serviceCandidates[assignment.id] = eligible.filter(id => memberIds.has(id))
  }

  return { partCandidates, serviceCandidates }
}
