import { EventStatus } from '~/features/events/model/event-status.type'
import { ProgrammeTemplateKey } from '~/features/events/model/programme-template.type'
import {
  getPartAssignmentAllowedRoleIds,
  getServiceRoleAssignmentAllowedRoleIds,
  resolveEligibleUserIds,
} from '~/features/events/server/allowed-roles.server'
import {
  checkEligibleForRole,
  checkExternalSpeakerValid,
  checkParticipantsDistinct,
  DAY_OFF_MESSAGE,
  PROGRAMME_ASSIGNMENT_ERRORS,
} from '~/features/events/server/programme-assignment.policy'
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
  await db.$executeRaw`SELECT id FROM "ProgrammePartAssignment" WHERE id = ${id} AND "congregationId" = ${congregationId} FOR UPDATE`
}

async function lockServiceRoleAssignmentRow(db: TransactionClient, id: number, congregationId: number): Promise<void> {
  await db.$executeRaw`SELECT id FROM "ProgrammeServiceRoleAssignment" WHERE id = ${id} AND "congregationId" = ${congregationId} FOR UPDATE`
}

export function getEventProgramme(db: TransactionClient, eventId: number, congregationId: number) {
  return db.event.findFirst({
    where: { id: eventId, congregationId },
    include: {
      template: true,
      kind: true,
      partAssignments: {
        include: {
          assignee: true,
          assistant: true,
          externalSpeaker: true,
        },
        orderBy: [{ order: 'asc' }, { trackOrder: { sort: 'asc', nulls: 'last' } }],
      },
      serviceRoleAssignments: {
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
  const existing = await db.programmePartAssignment.findFirst({
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

    const assignment = await db.programmePartAssignment.update({
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

  const assignment = await db.programmePartAssignment.update({
    where: { id_congregationId: { id: assignmentId, congregationId } },
    data: { assigneeId, assistantId, externalSpeakerId: null, topic: cleanTopic, hasConflict, durationMin },
  })

  return { assignment, previousAssigneeId, previousAssistantId }
}

export async function assignServiceRole(
  db: TransactionClient,
  assignmentId: number,
  assigneeId: number | null,
  congregationId: number,
) {
  await lockServiceRoleAssignmentRow(db, assignmentId, congregationId)
  const existing = await db.programmeServiceRoleAssignment.findFirst({
    where: { id: assignmentId, congregationId },
    include: { event: true },
  })
  if (!existing) return { error: PROGRAMME_ASSIGNMENT_ERRORS.assignmentNotFound }

  const previousAssigneeId = existing.assigneeId

  const isReleased = existing.event.status === EventStatus.Released
  let hasConflict = false

  if (assigneeId != null) {
    const allowed = await getServiceRoleAssignmentAllowedRoleIds(db, assignmentId, congregationId)
    const eligible = await resolveEligibleUserIds(db, allowed, congregationId)
    const ineligible = checkEligibleForRole(eligible, assigneeId, 'servant')
    if (ineligible) return ineligible
    if (await checkDayOffConflict(db, assigneeId, existing.event.startDate, existing.event.endDate, congregationId)) {
      if (isReleased) return { error: DAY_OFF_MESSAGE.servant }
      hasConflict = true
    }
  }

  const assignment = await db.programmeServiceRoleAssignment.update({
    where: { id_congregationId: { id: assignmentId, congregationId } },
    data: { assigneeId, hasConflict },
  })

  return { assignment, previousAssigneeId }
}

export async function unassignPart(db: TransactionClient, assignmentId: number, congregationId: number) {
  await lockPartAssignmentRow(db, assignmentId, congregationId)
  const existing = await db.programmePartAssignment.findFirst({
    where: { id: assignmentId, congregationId },
    select: { assigneeId: true, assistantId: true },
  })
  if (!existing) return null

  const assignment = await db.programmePartAssignment.update({
    where: {
      id_congregationId: { id: assignmentId, congregationId },
    },
    data: { assigneeId: null, assistantId: null, externalSpeakerId: null, hasConflict: false },
  })

  return { assignment, previousAssigneeId: existing.assigneeId, previousAssistantId: existing.assistantId }
}

export async function unassignServiceRole(db: TransactionClient, assignmentId: number, congregationId: number) {
  await lockServiceRoleAssignmentRow(db, assignmentId, congregationId)
  const existing = await db.programmeServiceRoleAssignment.findFirst({
    where: { id: assignmentId, congregationId },
    select: { assigneeId: true },
  })
  if (!existing) return null

  const assignment = await db.programmeServiceRoleAssignment.update({
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
      template: { key: ProgrammeTemplateKey.DayOff },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  })

  return conflictingDayOff != null
}

export async function refreshConflictFlags(
  db: TransactionClient,
  memberId: number,
  startDate: Date,
  endDate: Date,
  congregationId: number,
) {
  // Find all programme events (templated OR not) overlapping the range.
  // Day-off events themselves have no assignments and are excluded to avoid
  // pointless iteration.
  //
  // The `NOT: { template: {...} }` shape (rather than
  // `template: { key: { not } }`) matters: Prisma's relational filter
  // inner-joins through `template`, so the `key: { not: 'day-off' }` form
  // silently excludes events whose templateId is null — a shape older
  // legacy rows may still carry until the drop-EventKind migration lands.
  const overlappingEvents = await db.event.findMany({
    where: {
      congregationId,
      NOT: { template: { key: ProgrammeTemplateKey.DayOff } },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true, startDate: true, endDate: true },
  })

  for (const event of overlappingEvents) {
    // hasConflict is one flag per assignment row, but a part can have two
    // participants (speaker + reader). Computing the flag from ONLY the
    // refreshed member's state would silently clear a conflict that the
    // co-participant still owns — e.g. Alice removes her absence but Bob is
    // still absent on the same part. Recompute per row as
    // (assigneeConflict OR assistantConflict).
    const parts = await db.programmePartAssignment.findMany({
      where: {
        eventId: event.id,
        congregationId,
        OR: [{ assigneeId: memberId }, { assistantId: memberId }],
      },
      select: { id: true, assigneeId: true, assistantId: true },
    })

    for (const part of parts) {
      const assigneeConflict =
        part.assigneeId != null &&
        (await checkDayOffConflict(db, part.assigneeId, event.startDate, event.endDate, congregationId))
      const assistantConflict =
        part.assistantId != null &&
        (await checkDayOffConflict(db, part.assistantId, event.startDate, event.endDate, congregationId))

      await db.programmePartAssignment.update({
        where: { id_congregationId: { id: part.id, congregationId } },
        data: { hasConflict: assigneeConflict || assistantConflict },
      })
    }

    // Service-role rows have a single assignee, so a plain per-row recompute
    // is enough — no clobber scenario.
    const services = await db.programmeServiceRoleAssignment.findMany({
      where: { eventId: event.id, assigneeId: memberId, congregationId },
      select: { id: true, assigneeId: true },
    })

    for (const service of services) {
      const hasConflict =
        service.assigneeId != null &&
        (await checkDayOffConflict(db, service.assigneeId, event.startDate, event.endDate, congregationId))
      await db.programmeServiceRoleAssignment.update({
        where: { id_congregationId: { id: service.id, congregationId } },
        data: { hasConflict },
      })
    }
  }
}
