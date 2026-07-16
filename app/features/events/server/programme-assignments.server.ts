import { EventKind } from '~/features/events/model/event-kind.type'
import {
  getPartAssignmentAllowedRoleIds,
  getServiceRoleAssignmentAllowedRoleIds,
  resolveEligibleUserIds,
} from '~/features/events/server/allowed-roles.server'
import {
  checkEligibleForRole,
  checkExternalSpeakerValid,
  checkParticipantsDistinct,
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

export async function assignPart(
  db: TransactionClient,
  assignmentId: number,
  assigneeId: number | null,
  assistantId: number | null,
  externalSpeakerId: number | null,
  topic: string,
  congregationId: number,
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
      where: {
        id_congregationId: { id: assignmentId, congregationId },
      },
      data: { assigneeId: null, assistantId: null, externalSpeakerId, topic: cleanTopic, hasConflict: false },
    })
    return { assignment, previousAssigneeId, previousAssistantId }
  }

  const notDistinct = checkParticipantsDistinct(assigneeId, assistantId)
  if (notDistinct) return notDistinct

  let hasConflict = false

  if (assigneeId != null) {
    const allowed = await getPartAssignmentAllowedRoleIds(db, assignmentId, 'speaker', congregationId)
    const eligible = await resolveEligibleUserIds(db, allowed, congregationId)
    const ineligibleSpeaker = checkEligibleForRole(eligible, assigneeId, 'speaker')
    if (ineligibleSpeaker) return ineligibleSpeaker
    // Day-off overlaps used to abort here; they now flow through as
    // hasConflict=true and are surfaced by the release-blocking policy.
    if (await checkDayOffConflict(db, assigneeId, existing.event.startDate, existing.event.endDate, congregationId)) {
      hasConflict = true
    }
  }

  if (assistantId != null) {
    const allowed = await getPartAssignmentAllowedRoleIds(db, assignmentId, 'reader', congregationId)
    const eligible = await resolveEligibleUserIds(db, allowed, congregationId)
    const ineligibleReader = checkEligibleForRole(eligible, assistantId, 'reader')
    if (ineligibleReader) return ineligibleReader
    if (await checkDayOffConflict(db, assistantId, existing.event.startDate, existing.event.endDate, congregationId)) {
      hasConflict = true
    }
  }

  const assignment = await db.programmePartAssignment.update({
    where: {
      id_congregationId: { id: assignmentId, congregationId },
    },
    data: { assigneeId, assistantId, externalSpeakerId: null, topic: cleanTopic, hasConflict },
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

  let hasConflict = false

  if (assigneeId != null) {
    const allowed = await getServiceRoleAssignmentAllowedRoleIds(db, assignmentId, congregationId)
    const eligible = await resolveEligibleUserIds(db, allowed, congregationId)
    const ineligible = checkEligibleForRole(eligible, assigneeId, 'servant')
    if (ineligible) return ineligible
    if (await checkDayOffConflict(db, assigneeId, existing.event.startDate, existing.event.endDate, congregationId)) {
      hasConflict = true
    }
  }

  const assignment = await db.programmeServiceRoleAssignment.update({
    where: {
      id_congregationId: { id: assignmentId, congregationId },
    },
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
      kind: { key: EventKind.Off },
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
  // Off events themselves have no assignments and are excluded to avoid
  // pointless iteration.
  //
  // The `NOT: { kind: {...} }` shape (rather than `kind: { key: { not } }`)
  // matters: Prisma's relational filter inner-joins through `kind`, so the
  // `key: { not: 'off' }` form silently excludes events with a null kindId.
  // Seeded templates leave kindId null, so generated events inherit that null
  // and would otherwise never see their hasConflict flag refreshed — the
  // events-list badge, the view-page absence badge, and the release-blocking
  // policy all depend on this being right.
  const overlappingEvents = await db.event.findMany({
    where: {
      congregationId,
      NOT: { kind: { key: EventKind.Off } },
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
