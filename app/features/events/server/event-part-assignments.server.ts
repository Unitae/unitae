import { EventStatus } from '~/features/events/model/event-status.type'
import { EventTemplateKey } from '~/features/events/model/event-template.type'
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
async function lockPartAssignmentRow(db: TransactionClient, id: number, congregationId: number): Promise<void> {
  await db.$executeRaw`SELECT id FROM "EventPart" WHERE id = ${id} AND "congregationId" = ${congregationId} FOR UPDATE`
}

async function lockServicePartAssignmentRow(db: TransactionClient, id: number, congregationId: number): Promise<void> {
  await db.$executeRaw`SELECT id FROM "EventServicePart" WHERE id = ${id} AND "congregationId" = ${congregationId} FOR UPDATE`
}

export function getEventProgramme(db: TransactionClient, eventId: number, congregationId: number) {
  return db.event.findFirst({
    where: { id: eventId, congregationId },
    include: {
      template: true,
      eventParts: {
        include: {
          assignee: true,
          assistant: true,
          externalSpeaker: true,
          // Read live rather than denormalized: an improved wording should
          // reach assignments that already exist.
          preset: true,
        },
        orderBy: [{ order: 'asc' }, { trackOrder: { sort: 'asc', nulls: 'last' } }],
      },
      eventServiceParts: {
        include: {
          assignee: true,
        },
        orderBy: { name: 'asc' },
      },
    },
  })
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
  await lockPartAssignmentRow(db, assignmentId, congregationId)
  const existing = await db.eventPart.findFirst({
    where: { id: assignmentId, congregationId },
    include: { event: true },
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
    const speaker = await db.externalSpeaker.findFirst({
      where: { id: externalSpeakerId, congregationId, archivedAt: null },
    })
    const invalidSpeaker = checkExternalSpeakerValid(speaker)
    if (invalidSpeaker) return invalidSpeaker

    const assignment = await db.eventPart.update({
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

  // On a released event we still block day-off overlaps outright — silently
  // scheduling a publisher on top of a known absence on a public event is
  // exactly the kind of surprise we want to avoid. On a draft the manager is
  // building the schedule, so we save with hasConflict=true and let the
  // release-blocking policy surface it at publish time.
  const isReleased = existing.event.status === EventStatus.Released

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

  const assignment = await db.eventPart.update({
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
  await lockServicePartAssignmentRow(db, assignmentId, congregationId)
  const existing = await db.eventServicePart.findFirst({
    where: { id: assignmentId, congregationId },
    include: { event: true },
  })
  if (!existing) return { error: PROGRAMME_ASSIGNMENT_ERRORS.assignmentNotFound }

  const previousAssigneeId = existing.assigneeId

  const isReleased = existing.event.status === EventStatus.Released
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

  const assignment = await db.eventServicePart.update({
    where: { id_congregationId: { id: assignmentId, congregationId } },
    data: { assigneeId, hasConflict },
  })

  return { assignment, previousAssigneeId }
}

export async function unassignPart(db: TransactionClient, assignmentId: number, congregationId: number) {
  await lockPartAssignmentRow(db, assignmentId, congregationId)
  const existing = await db.eventPart.findFirst({
    where: { id: assignmentId, congregationId },
    select: { assigneeId: true, assistantId: true },
  })
  if (!existing) return null

  const assignment = await db.eventPart.update({
    where: {
      id_congregationId: { id: assignmentId, congregationId },
    },
    data: { assigneeId: null, assistantId: null, externalSpeakerId: null, hasConflict: false },
  })

  return { assignment, previousAssigneeId: existing.assigneeId, previousAssistantId: existing.assistantId }
}

export async function unassignServicePart(db: TransactionClient, assignmentId: number, congregationId: number) {
  await lockServicePartAssignmentRow(db, assignmentId, congregationId)
  const existing = await db.eventServicePart.findFirst({
    where: { id: assignmentId, congregationId },
    select: { assigneeId: true },
  })
  if (!existing) return null

  const assignment = await db.eventServicePart.update({
    where: {
      id_congregationId: { id: assignmentId, congregationId },
    },
    data: { assigneeId: null, hasConflict: false },
  })

  return { assignment, previousAssigneeId: existing.assigneeId }
}

// The `memberId` here is Member.id. Day-off events store the creator's
// UserAccount.id in Event.createdById, so we join through
// Event.createdBy.memberId to resolve the absence back to the same Member
// that carries assignments (assigneeId / assistantId reference Member).
export async function checkDayOffConflict(
  db: TransactionClient,
  memberId: number,
  startDate: Date,
  endDate: Date,
  congregationId: number,
): Promise<boolean> {
  const conflictingDayOff = await db.event.findFirst({
    where: {
      congregationId,
      createdBy: { memberId },
      template: { key: EventTemplateKey.DayOff },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  })

  return conflictingDayOff != null
}
