import { resolveProgrammeLink } from '~/features/display-board/index.server'
import { ScheduleStatus } from '~/features/events/model/schedule.type'
import { notify } from '~/features/notifications/index.server'
import { notificationRecipientFilter } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { formatEventDate } from '~/shared/utils/event-time'
import type { ProgrammeRole } from '../model/template-role'
import { type AssignmentChangeType, PROGRAMME_ASSIGNMENT_TYPE } from './notifications.server'

const logger = createLogger('notify-assignment')

// Shared shape the routes (assign-part, assign-service, remove-assignment) and
// the publishing burst hand to notifyAssignment. It carries no status: whether
// an assignment is public is read from its item's schedule (dispatchAssignmentDiffs),
// and a field that decides anything should be read the same way. `event.startDate` is the raw DB Date; we format it
// with the congregation's locale + timezone before it enters the payload so the
// worker doesn't need to know either. `templateId` feeds the event-link
// resolver — null means the event was created ad-hoc without a template, in
// which case the resolver falls back to /board.
export interface AssignmentNotificationContext {
  event: { id: number; name: string; startDate: Date; templateId: number | null }
  assignmentName: string
  entityType: 'Item'
  entityId: number
  congregationId: number
  actorId: number
  locale: string
  timezone: string
}

export type { AssignmentChangeType, ProgrammeRole }

// Small builder that keeps route callers to a single-line context assembly.
// `assignmentName` may be undefined (assignment fetched after deletion, etc.);
// it defaults to '' so the payload schema still accepts it.
export function buildAssignmentContext(args: {
  event: { id: number; name: string; startDate: Date; templateId: number | null }
  assignmentName: string | undefined
  entityType: 'Item'
  entityId: number
  congregationId: number
  actorId: number
  locale: string
  timezone: string
}): AssignmentNotificationContext {
  return {
    event: {
      id: args.event.id,
      name: args.event.name,
      startDate: args.event.startDate,
      templateId: args.event.templateId,
    },
    assignmentName: args.assignmentName ?? '',
    entityType: args.entityType,
    entityId: args.entityId,
    congregationId: args.congregationId,
    actorId: args.actorId,
    locale: args.locale,
    timezone: args.timezone,
  }
}

// One slot's diff between the previous and new assignee for a given role.
// `null` in either side means "empty" — the loop fires unassigned for a
// disappearing old, assigned for an appearing new.
export interface AssignmentDiff {
  role: ProgrammeRole
  previousMemberId: number | null
  newMemberId: number | null
}

// Pure builders that turn a service function's return shape into the diff
// arrays `dispatchAssignmentDiffs` consumes. Extracted so the mapping from
// `previousAssigneeId`/`previousAssistantId` → `[speaker, reader]` (and the
// service-role variant) is unit-testable in isolation instead of buried in
// three route actions. Routes call this and then `dispatchAssignmentDiffs`.

// Part assignment: two slots (speaker = assignee, reader = assistant). Either
// side of the diff can be null; the caller doesn't need to short-circuit.
export function partAssignmentDiffs(
  before: { previousAssigneeId: number | null; previousAssistantId: number | null },
  after: { assigneeId: number | null; assistantId: number | null },
): AssignmentDiff[] {
  return [
    { role: 'speaker', previousMemberId: before.previousAssigneeId, newMemberId: after.assigneeId },
    { role: 'reader', previousMemberId: before.previousAssistantId, newMemberId: after.assistantId },
  ]
}

// Service-role assignment: single slot (servant = assignee).
export function servicePartAssignmentDiffs(
  before: { previousAssigneeId: number | null },
  after: { assigneeId: number | null },
): AssignmentDiff[] {
  return [{ role: 'servant', previousMemberId: before.previousAssigneeId, newMemberId: after.assigneeId }]
}

// Fires the right notification(s) for every slot on a part or service-role
// assignment. Keeps the route action free of branching per slot.
export async function dispatchAssignmentDiffs(
  db: TransactionClient,
  ctx: AssignmentNotificationContext,
  diffs: AssignmentDiff[],
): Promise<void> {
  // Whitelist, not blacklist: only a published schedule fires notifications. Anything else — 'draft' today, whatever
  // status the schema grows, an item outside any schedule or gone — is silent, so a typo or an unhandled state cannot
  // spam publishers. The item's own schedule decides (plan §10, 5b), read here so no caller can hand it the event's
  // status instead. Nothing is kept while it is a draft: publishing tells each current assignee afresh
  // (publishSchedule → notifyTargets → fireReleaseNotifications), and an un-assignment made on a draft is never sent.
  const item = await db.item.findFirst({
    where: { id: ctx.entityId, congregationId: ctx.congregationId },
    select: { schedule: { select: { status: true } } },
  })
  const status = item?.schedule?.status ?? null
  if (item == null || item.schedule == null) {
    // Every writer puts an item in a schedule (eventScheduleId): one outside any, or an id that is no item, is a bug.
    logger.warn('assignment notifications suppressed: item outside any schedule, or not found', {
      eventId: ctx.event.id,
      congregationId: ctx.congregationId,
      entityId: ctx.entityId,
      itemFound: item != null,
      diffs: diffs.length,
    })
    return
  }
  if (status !== ScheduleStatus.Published) {
    // Debug (not warn) so operators can distinguish "we didn't notify because
    // the schedule was a draft" from a queue drop when investigating
    // "why didn't I get the email?" tickets. Log the actual status so an
    // unexpected value surfaces.
    logger.debug('assignment notifications suppressed: schedule is not published', {
      eventId: ctx.event.id,
      congregationId: ctx.congregationId,
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      status,
      diffs: diffs.length,
    })
    return
  }

  for (const diff of diffs) {
    if (diff.previousMemberId != null && diff.previousMemberId !== diff.newMemberId) {
      await notifyAssignment(db, ctx, {
        type: PROGRAMME_ASSIGNMENT_TYPE.unassigned,
        memberId: diff.previousMemberId,
        role: diff.role,
      })
    }
    if (diff.newMemberId != null && diff.newMemberId !== diff.previousMemberId) {
      await notifyAssignment(db, ctx, {
        type: PROGRAMME_ASSIGNMENT_TYPE.assigned,
        memberId: diff.newMemberId,
        role: diff.role,
      })
    }
  }
}

// Resolves the affected member's linked UserAccount and enqueues one
// notification for them. Silently no-ops when the member has no linked account
// (offline publisher) — a legitimate case, not an error.
export async function notifyAssignment(
  db: TransactionClient,
  ctx: AssignmentNotificationContext,
  change: { type: AssignmentChangeType; memberId: number; role: ProgrammeRole },
): Promise<void> {
  // notificationRecipientFilter gates out deactivated accounts and left /
  // anonymized members. UserAccount.active and Member.leftAt are independent
  // lifecycle states (accounts can outlive membership), so both must be
  // checked at every recipient-resolution site — the filter is the single
  // source of truth for that rule.
  const account = await db.userAccount.findFirst({
    where: {
      memberId: change.memberId,
      congregationId: ctx.congregationId,
      ...notificationRecipientFilter,
    },
    select: { id: true },
  })
  if (!account) {
    // Legit case (offline publisher, or an account that was deactivated after
    // being linked) — log at debug level so support can distinguish it from a
    // queue drop when investigating a "why didn't I get the email?" ticket.
    logger.debug('assignment notification skipped: no active linked account', {
      memberId: change.memberId,
      congregationId: ctx.congregationId,
      entityType: ctx.entityType,
      entityId: ctx.entityId,
    })
    return
  }

  const eventDate = formatEventDate(ctx.event.startDate, ctx.timezone, ctx.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  // Resolve at notify() time — freezes the URL against the current board
  // configuration. If an admin later moves or removes the programme tile,
  // pending notifications retain the previously-resolved URL.
  const link = await resolveProgrammeLink(
    db,
    { id: ctx.event.id, templateId: ctx.event.templateId },
    ctx.congregationId,
  )

  await notify(db, {
    type: change.type,
    entityType: ctx.entityType,
    entityId: ctx.entityId,
    congregationId: ctx.congregationId,
    recipientId: account.id,
    actorId: ctx.actorId,
    payload: {
      eventId: ctx.event.id,
      eventName: ctx.event.name,
      eventDate,
      assignmentName: ctx.assignmentName,
      role: change.role,
      link,
    },
  })
}

/**
 * Cancels the assignment notices still waiting for these items: they are going, or going back to a draft, and nobody
 * should be told about them. Returns how many were cancelled. A notice the previous image wrote during the rollout
 * names the old row (plan T12), so it is found through the items' legacy keys. Never runs an empty `in: []`, which a
 * refactor could turn into every pending notice of the congregation.
 */
export async function cancelPendingAssignmentNotices(
  db: TransactionClient,
  congregationId: number,
  itemIds: number[],
): Promise<number> {
  if (itemIds.length === 0) return 0
  const legacy = await db.item.findMany({
    where: { id: { in: itemIds }, congregationId },
    select: { legacyPartId: true, legacyServiceId: true },
  })
  const partIds = legacy.flatMap(item => (item.legacyPartId == null ? [] : [item.legacyPartId]))
  const serviceIds = legacy.flatMap(item => (item.legacyServiceId == null ? [] : [item.legacyServiceId]))
  const result = await db.notificationEvent.updateMany({
    where: {
      congregationId,
      status: 'pending',
      OR: [
        { entityType: 'Item', entityId: { in: itemIds } },
        ...(partIds.length > 0 ? [{ entityType: 'EventPart', entityId: { in: partIds } }] : []),
        ...(serviceIds.length > 0 ? [{ entityType: 'EventServicePart', entityId: { in: serviceIds } }] : []),
      ],
    },
    data: { status: 'cancelled', processedAt: new Date() },
  })
  return result.count
}
