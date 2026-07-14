import { resolveProgrammeLink } from '~/features/display-board/index.server'
import { notify } from '~/features/notifications/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { formatEventDate } from '~/shared/utils/event-time'

// Shared shape both routes (assign-part, assign-service, remove-assignment)
// hand to notifyAssignment. `event.startDate` is the raw DB Date; we format it
// with the congregation's locale + timezone before it enters the payload so the
// worker doesn't need to know either. `templateId` feeds the programme-link
// resolver — null means the event was created ad-hoc without a template, in
// which case the resolver falls back to /board.
export interface AssignmentNotificationContext {
  event: { id: number; name: string; startDate: Date; templateId: number | null }
  assignmentName: string
  entityType: 'ProgrammePartAssignment' | 'ProgrammeServiceRoleAssignment'
  entityId: number
  congregationId: number
  actorId: number
  locale: string
  timezone: string
}

export type ProgrammeRole = 'speaker' | 'reader' | 'servant'

export type AssignmentChangeType = 'programme.assignment.assigned' | 'programme.assignment.unassigned'

// Small builder that keeps route callers to a single-line context assembly.
// `assignmentName` may be undefined (assignment fetched after deletion, etc.);
// it defaults to '' so the payload schema still accepts it.
export function buildAssignmentContext(args: {
  event: { id: number; name: string; startDate: Date; templateId: number | null }
  assignmentName: string | undefined
  entityType: 'ProgrammePartAssignment' | 'ProgrammeServiceRoleAssignment'
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

// Fires the right notification(s) for every slot on a part or service-role
// assignment. Keeps the route action free of branching per slot.
export async function dispatchAssignmentDiffs(
  db: TransactionClient,
  ctx: AssignmentNotificationContext,
  diffs: AssignmentDiff[],
): Promise<void> {
  for (const diff of diffs) {
    if (diff.previousMemberId != null && diff.previousMemberId !== diff.newMemberId) {
      await notifyAssignment(db, ctx, {
        type: 'programme.assignment.unassigned',
        memberId: diff.previousMemberId,
        role: diff.role,
      })
    }
    if (diff.newMemberId != null && diff.newMemberId !== diff.previousMemberId) {
      await notifyAssignment(db, ctx, {
        type: 'programme.assignment.assigned',
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
  const account = await db.userAccount.findFirst({
    where: { memberId: change.memberId, congregationId: ctx.congregationId, active: true },
    select: { id: true },
  })
  if (!account) return

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
