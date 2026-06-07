import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

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
  await db.member.update({
    where: { id_congregationId: { id: params.publisherId, congregationId: params.congregationId } },
    data: { inactiveAt: new Date() },
  })

  audit({
    action: AuditAction.PublisherInactivated,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: 'Member',
    entityId: params.publisherId,
    metadata: { trigger: params.trigger },
  })
}

async function clearInactive(db: TransactionClient, params: EvaluateInactiveStatusParams) {
  await db.member.update({
    where: { id_congregationId: { id: params.publisherId, congregationId: params.congregationId } },
    data: { inactiveAt: null },
  })

  audit({
    action: AuditAction.PublisherReactivated,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: 'Member',
    entityId: params.publisherId,
    metadata: { trigger: params.trigger },
  })
}
