import { type PresetCapabilitySource, resolvePartCapability } from '~/features/events/model/part-capability'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getPartAssignmentAllowedRoleIds, resolveEligibleUserIds } from './allowed-roles.server'
import { listExternalSpeakers } from './external-speakers.server'

// Only what the capability rule needs. The labels are optional because this
// loader never renders them — the route labels its fields from the message
// catalogue — but they belong to the same resolution and are cheap to carry.
interface AssignmentSource {
  id: number
  allowExternalSpeaker: boolean
  speakerLabel?: string | null
  readerLabel?: string | null
  preset?: PresetCapabilitySource | null
}

// Collects the candidate lists the "assign a part" form needs (speaker
// pool, reader pool, external-speaker registry). Extracted from the
// assign-part route loader to keep the route file inside its size budget.
//
// The resolved capability comes back with them: the registry is only worth
// loading when the part may actually take an external speaker, and that is the
// kind's call whenever the part has one — including when the kind says no. The
// route renders from the same answer so the two cannot drift.
export async function loadPartAssignmentCandidates(
  db: TransactionClient,
  assignment: AssignmentSource | undefined,
  congregationId: number,
) {
  const capability = resolvePartCapability(
    {
      speakerLabel: assignment?.speakerLabel ?? null,
      readerLabel: assignment?.readerLabel ?? null,
      allowExternalSpeaker: assignment?.allowExternalSpeaker ?? false,
    },
    assignment?.preset,
  )
  const users = await db.member.findMany({
    where: { congregationId, leftAt: null },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })

  if (!assignment) {
    return { users, speakerCandidates: users, readerCandidates: users, externalSpeakers: [], capability }
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

  const externalSpeakers = capability.allowExternalSpeaker
    ? await listExternalSpeakers(db, congregationId, { includeArchived: false })
    : []
  const sortedExternalSpeakers = externalSpeakers.slice().sort((a, b) => {
    const aTime = a.lastVisitDate?.getTime() ?? -Infinity
    const bTime = b.lastVisitDate?.getTime() ?? -Infinity
    if (aTime === bTime) return a.name.localeCompare(b.name, 'fr')
    return aTime - bTime
  })

  return { users, speakerCandidates, readerCandidates, externalSpeakers: sortedExternalSpeakers, capability }
}
