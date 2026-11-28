import { roomBeingAssigned } from '~/features/events/model/part-rooms'
import { type CadencePayload, EMPTY_CADENCE } from '~/features/events/server/cadence-shared.server'
import { PART_ITEMS } from '~/features/events/server/item-projection.server'
import { listExternalSpeakerCadence } from '~/features/events/server/list-external-speaker-cadence.server'
import type { TransactionClient } from '~/shared/infra/db.server'

type Options = {
  externalSpeakerId: number
  event: { templateId: number | null; id: number; startDate: Date }
  congregationId: number
  excludePartAssignmentId: number | null
  /** The room being assigned (parallel rooms); none, the part's only or main room. */
  roomId?: number | null
}

const PAST_COUNT = 6
const FUTURE_COUNT = 6

// Looks up the part assignment the sheet is editing, reads its canonical
// anchor (name + section) and its saved externalSpeakerId, then hands off
// to listExternalSpeakerCadence. Returns EMPTY_CADENCE (anchored=false)
// when no anchor was requested or the assignment could not be resolved.
export async function resolveExternalSpeakerCadence(
  db: TransactionClient,
  { externalSpeakerId, event, congregationId, excludePartAssignmentId, roomId }: Options,
): Promise<CadencePayload> {
  if (excludePartAssignmentId == null) return EMPTY_CADENCE

  const current = await db.item.findFirst({
    where: { id: excludePartAssignmentId, congregationId, ...PART_ITEMS },
    select: {
      name: true,
      section: true,
      externalSpeakerId: true,
      rooms: { select: { roomId: true, externalSpeakerId: true, room: { select: { key: true } } } },
    },
  })
  if (!current) return EMPTY_CADENCE

  // Who is saved on the room being assigned: its row (parallel rooms R4 writes people there alone).
  const saved = (roomBeingAssigned(current.rooms ?? [], roomId) ?? current).externalSpeakerId
  const savedMatchesSelection = saved != null && saved === externalSpeakerId
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
