import type { TransactionClient } from '~/shared/infra/db.server'
import { getPartAssignmentAllowedRoleIds, resolveEligibleUserIds } from './allowed-roles.server'
import { listExternalSpeakers } from './external-speakers.server'

// Collects the candidate lists the "assign a part" form needs (speaker
// pool, reader pool, external-speaker registry). Extracted from the
// assign-part route loader to keep the route file inside its size budget.
export async function loadPartAssignmentCandidates(
  db: TransactionClient,
  assignment: { id: number; allowExternalSpeaker: boolean } | undefined,
  congregationId: number,
) {
  const users = await db.member.findMany({
    where: { congregationId, leftAt: null },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })

  if (!assignment) {
    return { users, speakerCandidates: users, readerCandidates: users, externalSpeakers: [] }
  }

  const userById = new Map(users.map(u => [u.id, u]))

  const [speakerAllowed, readerAllowed] = await Promise.all([
    getPartAssignmentAllowedRoleIds(db, assignment.id, 'speaker', congregationId),
    getPartAssignmentAllowedRoleIds(db, assignment.id, 'reader', congregationId),
  ])
  const [speakerIds, readerIds] = await Promise.all([
    resolveEligibleUserIds(db, speakerAllowed, congregationId),
    resolveEligibleUserIds(db, readerAllowed, congregationId),
  ])

  const speakerCandidates = speakerIds.map(id => userById.get(id)).filter((u): u is (typeof users)[number] => u != null)
  const readerCandidates = readerIds.map(id => userById.get(id)).filter((u): u is (typeof users)[number] => u != null)

  const externalSpeakers = assignment.allowExternalSpeaker
    ? await listExternalSpeakers(db, congregationId, { includeArchived: false })
    : []
  const sortedExternalSpeakers = externalSpeakers.slice().sort((a, b) => {
    const aTime = a.lastVisitDate?.getTime() ?? -Infinity
    const bTime = b.lastVisitDate?.getTime() ?? -Infinity
    if (aTime === bTime) return a.name.localeCompare(b.name, 'fr')
    return aTime - bTime
  })

  return { users, speakerCandidates, readerCandidates, externalSpeakers: sortedExternalSpeakers }
}
