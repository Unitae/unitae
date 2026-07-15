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

interface ActivityRow {
  year: number
  month: number
  isPublisher: boolean
  hours: number | null
}

/**
 * Re-evaluates a publisher's inactive flag based on their monthly activity
 * reports. Called after every PublisherActivity write.
 *
 * Streak rule (calendar-consecutive with gap-fill between misses):
 *   1. Start at the newest report. If it's not a missed-preach entry, streak = 0.
 *   2. Walk backward one calendar month at a time.
 *      - A month with a missed-preach report counts.
 *      - A month with an hours report ends the walk.
 *      - A month with no record counts ONLY if a missed report exists at some
 *        older month (gap-fill between two missed records); otherwise the walk
 *        ends. Nothing is filled before the publisher's oldest missed record.
 *   3. If the streak reaches 6+, the publisher becomes inactive as of the first
 *      day of the month AFTER the 6th-oldest month in the streak. That month
 *      itself still displays as irregular (they filed a missed report that
 *      month); the badge flips starting the following month.
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

  const activities = (await db.publisherActivity.findMany({
    where: { publisherId: params.publisherId, congregationId: params.congregationId },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { isPublisher: true, hours: true, year: true, month: true },
  })) as ActivityRow[]

  const streakOnset = computeStreakOnset(activities)
  if (streakOnset == null) return

  await setInactive(db, params, streakOnset)
}

function isHoursReport(activity: EvaluateInactiveStatusParams['triggeringActivity']): boolean {
  return activity?.isPublisher === true && (activity.hours ?? 0) > 0
}

function isMissedPreachReport(activity: { isPublisher: boolean; hours: number | null }): boolean {
  return activity.isPublisher === false && (activity.hours == null || activity.hours === 0)
}

/**
 * Walks the calendar backward from the newest report and returns the timestamp
 * at which the publisher becomes inactive, or `null` if the streak is shorter
 * than the threshold. See the JSDoc on `evaluateInactiveStatus` for the rule.
 *
 * `activities` must be pre-sorted newest-first, matching the evaluator query.
 */
function computeStreakOnset(activities: ActivityRow[]): Date | null {
  if (activities.length === 0) return null
  const newest = activities[0]
  if (!isMissedPreachReport(newest)) return null

  const index = indexActivities(activities)
  // Newest is missed → oldestMissed cannot be null here.
  if (index.oldestMissed == null) return null

  const streak = walkStreak(newest, index)
  if (streak.length < INACTIVE_STREAK_THRESHOLD) return null

  // streak is newest-first; the 6th-oldest sits at (length - THRESHOLD).
  const completing = streak[streak.length - INACTIVE_STREAK_THRESHOLD]
  return new Date(completing.year, completing.month + 1, 1)
}

interface ActivityIndex {
  byMonth: Map<string, ActivityRow>
  oldestMissed: { year: number; month: number } | null
}

function indexActivities(activities: ActivityRow[]): ActivityIndex {
  const byMonth = new Map<string, ActivityRow>()
  let oldestMissed: { year: number; month: number } | null = null
  for (const row of activities) {
    byMonth.set(monthKey(row.year, row.month), row)
    if (!isMissedPreachReport(row)) continue
    if (oldestMissed == null || compareYm(row, oldestMissed) < 0) {
      oldestMissed = { year: row.year, month: row.month }
    }
  }
  return { byMonth, oldestMissed }
}

function walkStreak(newest: ActivityRow, index: ActivityIndex): { year: number; month: number }[] {
  const streak: { year: number; month: number }[] = []
  let cursor = { year: newest.year, month: newest.month }
  while (shouldIncludeMonth(cursor, index)) {
    streak.push(cursor)
    cursor = previousMonth(cursor)
  }
  return streak
}

function shouldIncludeMonth(ym: { year: number; month: number }, index: ActivityIndex): boolean {
  const row = index.byMonth.get(monthKey(ym.year, ym.month))
  if (row) return isMissedPreachReport(row)
  // Gap month — fill only if a missed record exists at some older month.
  return index.oldestMissed != null && compareYm(ym, index.oldestMissed) > 0
}

function monthKey(year: number, month: number): string {
  return `${year}-${month}`
}

function compareYm(a: { year: number; month: number }, b: { year: number; month: number }): number {
  return a.year !== b.year ? a.year - b.year : a.month - b.month
}

function previousMonth(ym: { year: number; month: number }): { year: number; month: number } {
  return ym.month === 0 ? { year: ym.year - 1, month: 11 } : { year: ym.year, month: ym.month - 1 }
}

async function setInactive(db: TransactionClient, params: EvaluateInactiveStatusParams, at: Date) {
  await memberAggregate.setLifecycle(
    db,
    params.publisherId as MemberId,
    params.congregationId,
    params.actorId,
    'inactive',
    params.trigger,
    at,
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
