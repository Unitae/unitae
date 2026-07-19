import { type CadencePayload, EMPTY_CADENCE } from '~/features/events/server/cadence-shared.server'
import { listExternalSpeakerCadence } from '~/features/events/server/list-external-speaker-cadence.server'
import type { TransactionClient } from '~/shared/infra/db.server'

type Options = {
  externalSpeakerId: number
  event: { templateId: number | null; id: number; startDate: Date }
  congregationId: number
  excludePartAssignmentId: number | null
}

const PAST_COUNT = 6
const FUTURE_COUNT = 6

// Looks up the part assignment the sheet is editing, reads its canonical
// anchor (name + section) and its saved externalSpeakerId, then hands off
// to listExternalSpeakerCadence. Returns EMPTY_CADENCE (anchored=false)
// when no anchor was requested or the assignment could not be resolved.
export async function resolveExternalSpeakerCadence(
  db: TransactionClient,
  { externalSpeakerId, event, congregationId, excludePartAssignmentId }: Options,
): Promise<CadencePayload> {
  if (excludePartAssignmentId == null) return EMPTY_CADENCE

  const current = await db.programmePartAssignment.findFirst({
    where: { id: excludePartAssignmentId, congregationId },
    select: { name: true, section: true, externalSpeakerId: true },
  })
  if (!current) return EMPTY_CADENCE

  const savedMatchesSelection = current.externalSpeakerId != null && current.externalSpeakerId === externalSpeakerId
  const cadence = await listExternalSpeakerCadence(db, {
    externalSpeakerId,
    event,
    congregationId,
    partName: current.name,
    partSection: current.section,
    pastCount: PAST_COUNT,
    futureCount: FUTURE_COUNT,
  })
  return { ...cadence, anchored: true, savedMatchesSelection }
}
