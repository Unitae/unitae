import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'
import * as memberAggregate from './member.aggregate'

const INACTIVE_STREAK_THRESHOLD = 6

export type EvaluateInactiveStatusTrigger = 'activity-created' | 'activity-updated' | 'activity-deleted'

export interface EvaluateInactiveStatusParams {
  publisherId: number
  congregationId: number
  actorId: number
  trigger: EvaluateInactiveStatusTrigger
  /**
   * The post-mutation state of the activity row that triggered this evaluation.
   * Used to detect an "hours arrived" event that should silently clear an
   * existing inactive flag. Omit for deletions.
   */
  triggeringActivity?: { isPublisher: boolean; hours: number | null } | null
}

/**
 * Re-evaluates a publisher's inactive flag based on their most recent monthly
 * activity reports. Called after every PublisherActivity write.
 *
 * Set rule: the publisher has at least 6 reports and the most recent 6 are all
 * explicit "didn't preach" entries (isPublisher=false && hours falsy).
 *
 * Clear rule: only fires when an hours report arrives (isPublisher=true &&
 * hours>0) via create/update. Deletions never clear — see the inline comment on
 * the trigger semantics.
 *
 * No-ops when the member has left or isn't a publisher (those states already
 * exclude them from the relevant surfaces).
 *
 * Precedence with sibling lifecycle columns:
 *
 *   - `leftAt` and `inactiveAt` are orthogonal — both can be non-null at once.
 *     The evaluator no-ops when `leftAt != null`; we never auto-flip inactive
 *     on a member who has left.
 *   - `setMemberLeft`, `make-student`, and `togglePublisherStatus` do NOT
 *     clear `inactiveAt`. Rationale: if the member returns later (via
 *     `mark-as-returned` or a re-promotion to publisher), restoring their
 *     prior inactive state preserves history. A subsequent hours report will
 *     clear it through the normal path.
 *   - The UI subordinates inactive to left: the `LifecycleAction` component
 *     in `publisher.tsx` only renders `InactiveToggle` when
 *     `leftAt == null && isPublisher == true`. A left-and-inactive member
 *     shows no inactive UI; on return, the badge resurfaces automatically.
 */
export async function evaluateInactiveStatus(
  db: TransactionClient,
  params: EvaluateInactiveStatusParams,
): Promise<void> {
  const member = await db.member.findUnique({
    where: { id_congregationId: { id: params.publisherId, congregationId: params.congregationId } },
    select: { inactiveAt: true, isPublisher: true, leftAt: true },
  })

  if (member == null) return
  if (member.leftAt != null || !member.isPublisher) return

  if (member.inactiveAt != null && isHoursReport(params.triggeringActivity)) {
    await clearInactive(db, params)
    return
  }

  if (member.inactiveAt != null) {
    return
  }

  const recent = await db.publisherActivity.findMany({
    where: { publisherId: params.publisherId, congregationId: params.congregationId },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: INACTIVE_STREAK_THRESHOLD,
    select: { isPublisher: true, hours: true },
  })

  if (recent.length < INACTIVE_STREAK_THRESHOLD) return
  if (!recent.every(isMissedPreachReport)) return

  await setInactive(db, params)
}

function isHoursReport(activity: EvaluateInactiveStatusParams['triggeringActivity']): boolean {
  return activity?.isPublisher === true && (activity.hours ?? 0) > 0
}

function isMissedPreachReport(activity: { isPublisher: boolean; hours: number | null }): boolean {
  return activity.isPublisher === false && (activity.hours == null || activity.hours === 0)
}

async function setInactive(db: TransactionClient, params: EvaluateInactiveStatusParams) {
  await memberAggregate.setLifecycle(
    db,
    params.publisherId as MemberId,
    params.congregationId,
    params.actorId,
    'inactive',
    params.trigger,
  )
}

async function clearInactive(db: TransactionClient, params: EvaluateInactiveStatusParams) {
  await memberAggregate.setLifecycle(
    db,
    params.publisherId as MemberId,
    params.congregationId,
    params.actorId,
    'active',
    params.trigger,
  )
}
