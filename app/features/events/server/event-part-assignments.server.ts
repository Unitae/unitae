import { ScheduleStatus } from '~/features/events/model/schedule.type'
import {
  getPartAssignmentAllowedRoleIds,
  getServicePartAssignmentAllowedRoleIds,
  resolveEligibleUserIds,
} from '~/features/events/server/allowed-roles.server'
import {
  checkEligibleForRole,
  checkExternalSpeakerValid,
  checkParticipantsDistinct,
  DAY_OFF_MESSAGE,
  PROGRAMME_ASSIGNMENT_ERRORS,
} from '~/features/events/server/event-part.policy'
import {
  asEventPart,
  asEventServicePart,
  ITEM_ORIGIN_INCLUDE,
  PART_ITEM_ORDER,
  PART_ITEMS,
  SERVICE_ITEM_ORDER,
  SERVICE_ITEMS,
} from '~/features/events/server/item-projection.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// Acquire a row-level lock on the assignment before the read+update sequence.
// Without this, two overlapping transactions both read `previousAssigneeId`
// under READ COMMITTED (Postgres default), both fire an "assigned"
// notification, and the loser silently gets a phantom email. The lock is
// released at transaction commit — routes wrap the whole action in
// `withScopeFromContext`, which is one transaction.
//
// SELECT on a non-existent row returns zero rows without blocking, so the
// caller's `findFirst`-then-branch shape still works.
async function lockItemRow(db: TransactionClient, id: number, congregationId: number): Promise<void> {
  await db.$executeRaw`SELECT id FROM "Item" WHERE id = ${id} AND "congregationId" = ${congregationId} FOR UPDATE`
}

export async function getEventProgramme(db: TransactionClient, eventId: number, congregationId: number) {
  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    // With the counts of its template: they say whether an empty event waits for its programme (isAwaitingProgramme).
    include: { template: { include: { _count: { select: { parts: true, serviceParts: true } } } } },
  })
  if (!event) return null
  const [parts, services] = await Promise.all([
    db.item.findMany({
      where: { eventId, congregationId, ...PART_ITEMS },
      include: {
        ...ITEM_ORIGIN_INCLUDE,
        assignee: true,
        assistant: true,
        // archivedAt and the congregation: a speaker retired after being planned is flagged on the programme.
        externalSpeaker: { include: { speakerCongregation: { select: { name: true } } } },
        // Read live rather than denormalized: an improved wording should reach assignments that already exist.
        preset: true,
      },
      orderBy: PART_ITEM_ORDER,
    }),
    db.item.findMany({
      where: { eventId, congregationId, ...SERVICE_ITEMS },
      include: { ...ITEM_ORIGIN_INCLUDE, assignee: true },
      orderBy: SERVICE_ITEM_ORDER,
    }),
  ])
  return { ...event, eventParts: parts.map(asEventPart), eventServiceParts: services.map(asEventServicePart) }
}

// Runs the per-participant checks used by assignPart for both speaker and
// reader. Returns a Rejection on hard failure (ineligible role, or day-off
// on a released event) or a hasConflict flag the caller ORs together for the
// eventual `data.hasConflict` write.
async function checkPartParticipant(
  db: TransactionClient,
  args: {
    assignmentId: number
    participantId: number | null
    roleKind: 'speaker' | 'reader'
    event: { startDate: Date; endDate: Date }
    congregationId: number
    isReleased: boolean
  },
): Promise<{ error: string } | { hasConflict: boolean }> {
  const { assignmentId, participantId, roleKind, event, congregationId, isReleased } = args
  if (participantId == null) return { hasConflict: false }

  const allowed = await getPartAssignmentAllowedRoleIds(db, assignmentId, roleKind, congregationId)
  const eligible = await resolveEligibleUserIds(db, allowed, congregationId)
  const ineligible = checkEligibleForRole(eligible, participantId, roleKind)
  if (ineligible) return ineligible

  if (await checkDayOffConflict(db, participantId, event.startDate, event.endDate, congregationId)) {
    if (isReleased) return { error: DAY_OFF_MESSAGE[roleKind] }
    return { hasConflict: true }
  }
  return { hasConflict: false }
}

export async function assignPart(
  db: TransactionClient,
  assignmentId: number,
  assigneeId: number | null,
  assistantId: number | null,
  externalSpeakerId: number | null,
  topic: string,
  congregationId: number,
  durationMin: number | null = null,
) {
  await lockItemRow(db, assignmentId, congregationId)
  const existing = await db.item.findFirst({
    where: { id: assignmentId, congregationId, ...PART_ITEMS },
    include: { event: true, schedule: { select: { status: true } } },
  })
  // Inlined so TS narrows `existing` for the rest of the writer; the shared
  // message lives in PROGRAMME_ASSIGNMENT_ERRORS so both writers stay in sync.
  if (!existing) return { error: PROGRAMME_ASSIGNMENT_ERRORS.assignmentNotFound }

  // Captured before the update so the route can diff old vs. new and decide
  // which members to notify (assigned / unassigned).
  const previousAssigneeId = existing.assigneeId
  const previousAssistantId = existing.assistantId

  const cleanTopic = sanitizeText(topic)

  if (externalSpeakerId != null) {
    // A deleted speaker is never assignable; a retired one only stays where they already are.
    const speaker = await db.externalSpeaker.findFirst({
      where: { id: externalSpeakerId, congregationId, anonymizedAt: null },
      select: { archivedAt: true },
    })
    const invalidSpeaker = checkExternalSpeakerValid(speaker, existing.externalSpeakerId === externalSpeakerId)
    if (invalidSpeaker) return invalidSpeaker

    const assignment = await db.item.update({
      where: { id_congregationId: { id: assignmentId, congregationId } },
      data: {
        assigneeId: null,
        assistantId: null,
        externalSpeakerId,
        topic: cleanTopic,
        hasConflict: false,
        durationMin,
      },
    })
    return { assignment, previousAssigneeId, previousAssistantId }
  }

  const notDistinct = checkParticipantsDistinct(assigneeId, assistantId)
  if (notDistinct) return notDistinct

  // On a published schedule we still block day-off overlaps outright — silently
  // scheduling a publisher on top of a known absence on a public programme is
  // exactly the kind of surprise we want to avoid. On a draft the manager is
  // building it, so we save with hasConflict=true and let the publishing
  // refusal surface it. The item's own schedule decides, not the event (plan §10).
  const isReleased = existing.schedule?.status === ScheduleStatus.Published

  const speakerCheck = await checkPartParticipant(db, {
    assignmentId,
    participantId: assigneeId,
    roleKind: 'speaker',
    event: existing.event,
    congregationId,
    isReleased,
  })
  if ('error' in speakerCheck) return speakerCheck

  const readerCheck = await checkPartParticipant(db, {
    assignmentId,
    participantId: assistantId,
    roleKind: 'reader',
    event: existing.event,
    congregationId,
    isReleased,
  })
  if ('error' in readerCheck) return readerCheck

  const hasConflict = speakerCheck.hasConflict || readerCheck.hasConflict

  const assignment = await db.item.update({
    where: { id_congregationId: { id: assignmentId, congregationId } },
    data: { assigneeId, assistantId, externalSpeakerId: null, topic: cleanTopic, hasConflict, durationMin },
  })

  return { assignment, previousAssigneeId, previousAssistantId }
}

export async function assignServicePart(
  db: TransactionClient,
  assignmentId: number,
  assigneeId: number | null,
  congregationId: number,
) {
  await lockItemRow(db, assignmentId, congregationId)
  const existing = await db.item.findFirst({
    where: { id: assignmentId, congregationId, ...SERVICE_ITEMS },
    include: { event: true, schedule: { select: { status: true } } },
  })
  if (!existing) return { error: PROGRAMME_ASSIGNMENT_ERRORS.assignmentNotFound }

  const previousAssigneeId = existing.assigneeId

  // As assignPart: the item's own schedule decides.
  const isReleased = existing.schedule?.status === ScheduleStatus.Published
  let hasConflict = false

  if (assigneeId != null) {
    const allowed = await getServicePartAssignmentAllowedRoleIds(db, assignmentId, congregationId)
    const eligible = await resolveEligibleUserIds(db, allowed, congregationId)
    const ineligible = checkEligibleForRole(eligible, assigneeId, 'servant')
    if (ineligible) return ineligible
    if (await checkDayOffConflict(db, assigneeId, existing.event.startDate, existing.event.endDate, congregationId)) {
      if (isReleased) return { error: DAY_OFF_MESSAGE.servant }
      hasConflict = true
    }
  }

  const assignment = await db.item.update({
    where: { id_congregationId: { id: assignmentId, congregationId } },
    data: { assigneeId, hasConflict },
  })

  return { assignment, previousAssigneeId }
}

export async function unassignPart(db: TransactionClient, assignmentId: number, congregationId: number) {
  await lockItemRow(db, assignmentId, congregationId)
  const existing = await db.item.findFirst({
    where: { id: assignmentId, congregationId, ...PART_ITEMS },
    select: { assigneeId: true, assistantId: true },
  })
  if (!existing) return null

  const assignment = await db.item.update({
    where: {
      id_congregationId: { id: assignmentId, congregationId },
    },
    data: { assigneeId: null, assistantId: null, externalSpeakerId: null, hasConflict: false },
  })

  return { assignment, previousAssigneeId: existing.assigneeId, previousAssistantId: existing.assistantId }
}

export async function unassignServicePart(db: TransactionClient, assignmentId: number, congregationId: number) {
  await lockItemRow(db, assignmentId, congregationId)
  const existing = await db.item.findFirst({
    where: { id: assignmentId, congregationId, ...SERVICE_ITEMS },
    select: { assigneeId: true },
  })
  if (!existing) return null

  const assignment = await db.item.update({
    where: {
      id_congregationId: { id: assignmentId, congregationId },
    },
    data: { assigneeId: null, hasConflict: false },
  })

  return { assignment, previousAssigneeId: existing.assigneeId }
}

// `memberId` is Member.id, the id assignments carry (assigneeId / assistantId). An absence declared from an account
// without a record has memberId null and never matches: such an account holds no assignments. The record is the one
// the row was written with; linking an account to a record, by hand or by a restore, moves its rows.
export async function checkDayOffConflict(
  db: TransactionClient,
  memberId: number,
  startDate: Date,
  endDate: Date,
  congregationId: number,
): Promise<boolean> {
  const conflictingAbsence = await db.absence.findFirst({
    where: { congregationId, memberId, startDate: { lte: endDate }, endDate: { gte: startDate } },
    select: { id: true },
  })

  return conflictingAbsence != null
}
