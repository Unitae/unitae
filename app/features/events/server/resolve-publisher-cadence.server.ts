import { type CadencePayload, EMPTY_CADENCE, type PartSlot } from '~/features/events/server/cadence-shared.server'
import { listUserCadence } from '~/features/events/server/list-user-cadence.server'
import { listUserServiceCadence } from '~/features/events/server/list-user-service-cadence.server'
import type { TransactionClient } from '~/shared/infra/db.server'

type Options = {
  userId: number
  event: { templateId: number | null; id: number; startDate: Date }
  congregationId: number
  excludePartAssignmentId: number | null
  excludeServiceAssignmentId: number | null
  partSlot: PartSlot
}

const PAST_COUNT = 6
const FUTURE_COUNT = 6

// Looks up the assignment the sheet is editing (part or service) and hands
// off to the appropriate cadence helper with the canonical anchor read from
// the row. Returns EMPTY_CADENCE (anchored=false) when no anchor was
// requested or the assignment could not be resolved — the card gates on
// `anchored` to decide whether to render the whole panel.
export async function resolvePublisherCadence(
  db: TransactionClient,
  { userId, event, congregationId, excludePartAssignmentId, excludeServiceAssignmentId, partSlot }: Options,
): Promise<CadencePayload> {
  if (excludePartAssignmentId != null) {
    const current = await db.programmePartAssignment.findFirst({
      where: { id: excludePartAssignmentId, congregationId },
      select: { name: true, section: true, assigneeId: true, assistantId: true },
    })
    if (!current) return EMPTY_CADENCE
    const savedId = partSlot === 'assignee' ? current.assigneeId : current.assistantId
    const savedMatchesSelection = savedId != null && savedId === userId
    const cadence = await listUserCadence(db, {
      userId,
      event,
      congregationId,
      partName: current.name,
      partSection: current.section,
      slot: partSlot,
      pastCount: PAST_COUNT,
      futureCount: FUTURE_COUNT,
    })
    return { ...cadence, anchored: true, savedMatchesSelection }
  }

  if (excludeServiceAssignmentId != null) {
    const current = await db.programmeServiceRoleAssignment.findFirst({
      where: { id: excludeServiceAssignmentId, congregationId },
      select: { name: true, assigneeId: true },
    })
    if (!current) return EMPTY_CADENCE
    const savedMatchesSelection = current.assigneeId != null && current.assigneeId === userId
    const cadence = await listUserServiceCadence(db, {
      userId,
      event,
      congregationId,
      serviceRoleName: current.name,
      pastCount: PAST_COUNT,
      futureCount: FUTURE_COUNT,
    })
    return { ...cadence, anchored: true, savedMatchesSelection }
  }

  return EMPTY_CADENCE
}
