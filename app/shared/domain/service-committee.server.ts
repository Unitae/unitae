import { AuditAction, audit } from '~/shared/domain/audit.server'
import { SERVICE_COMMITTEE_KEY, SERVICE_COMMITTEE_POST_KEYS } from '~/shared/domain/built-in-roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// The service committee's membership is derived, never typed.
//
// A congregation's committee IS the coordinator, the secretary and the service overseer — that
// is what the word means, not a list that happens to contain them. So seating a coordinator
// joins them to the committee and unseating removes them, the same way the elder roster is
// reconciled from Member flags rather than edited by hand.
//
// These are real rows on the members' records rather than a union computed while rendering, because
// permissions resolve from the assignment tables: a committee role carrying a permission has to
// actually reach the three people holding its posts. The titulaires are elders, so they always
// have a record; a seat older code left on a login is read through that login's record.

/**
 * The records holding any of these roles, wherever the seat is kept. A person holding two posts during a transition is
 * one member of the committee, hence a set.
 */
async function recordsHolding(
  db: TransactionClient,
  roleIds: number[],
  congregationId: number,
  kind?: string,
): Promise<Set<number>> {
  const onRecord: { memberId: number }[] = await db.memberRoleAssignment.findMany({
    where: { roleId: { in: roleIds }, congregationId, ...(kind ? { kind } : {}) },
    select: { memberId: true },
  })
  const onLogin: { user: { memberId: number | null } }[] = await db.userRoleAssignment.findMany({
    where: { roleId: { in: roleIds }, congregationId, ...(kind ? { kind } : {}) },
    select: { user: { select: { memberId: true } } },
  })
  const memberIds = [...onRecord.map(row => row.memberId), ...onLogin.map(row => row.user.memberId)]
  return new Set(memberIds.filter((id): id is number => id != null))
}

/**
 * Reconcile the committee's members with whoever currently holds its three posts.
 *
 * Idempotent, and cheap enough to call after every seating: when the membership already matches
 * it writes nothing, so a no-op does not churn rows or fill the audit log with changes nobody
 * made. Safe on a congregation that has no committee role — an archive restored from before the
 * committee existed still has to be able to seat people.
 */
export async function syncServiceCommitteeMembers(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
): Promise<void> {
  const roles: { id: number; key: string }[] = await db.role.findMany({
    where: { congregationId, key: { in: [SERVICE_COMMITTEE_KEY, ...SERVICE_COMMITTEE_POST_KEYS] } },
    select: { id: true, key: true },
  })

  const committee = roles.find(role => role.key === SERVICE_COMMITTEE_KEY)
  if (!committee) return

  // Ordered by the canonical post order rather than by whatever the query returned, so the
  // query this builds is stable and readable in a log.
  const postIds = SERVICE_COMMITTEE_POST_KEYS.map(key => roles.find(role => role.key === key)?.id).filter(
    (id): id is number => id != null,
  )
  if (postIds.length === 0) return

  // Titulaires only: a post may carry deputy seats, but the coordinator's adjoint helps the
  // coordinator — they do not sit on the committee.
  const desired = await recordsHolding(db, postIds, congregationId, 'leader')
  const existing = await recordsHolding(db, [committee.id], congregationId)

  const added = [...desired].filter(memberId => !existing.has(memberId))
  const removed = [...existing].filter(memberId => !desired.has(memberId))
  if (added.length === 0 && removed.length === 0) return

  if (added.length > 0) {
    await db.memberRoleAssignment.createMany({
      data: added.map(memberId => ({ memberId, roleId: committee.id, congregationId, kind: 'member' })),
      skipDuplicates: true,
    })
  }
  if (removed.length > 0) {
    await db.memberRoleAssignment.deleteMany({
      where: { roleId: committee.id, congregationId, memberId: { in: removed } },
    })
    await db.userRoleAssignment.deleteMany({
      where: { roleId: committee.id, congregationId, user: { memberId: { in: removed } } },
    })
  }

  audit({
    action: AuditAction.UserRoleAssignmentChanged,
    congregationId,
    actorId,
    entityType: 'Role',
    entityId: committee.id,
    metadata: { change: 'service-committee-synced', added, removed },
  })
}
