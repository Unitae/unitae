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
// These are real `UserRoleAssignment` rows rather than a union computed while rendering, because
// permissions resolve from that table: a committee role carrying a permission has to actually
// reach the three people holding its posts.

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
  const held: { userId: number }[] = await db.userRoleAssignment.findMany({
    where: { roleId: { in: postIds }, congregationId, kind: 'leader' },
    select: { userId: true },
  })
  const current: { userId: number }[] = await db.userRoleAssignment.findMany({
    where: { roleId: committee.id, congregationId },
    select: { userId: true },
  })

  // A person may hold two posts during a transition; they are one member of the committee.
  const desired = new Set(held.map(row => row.userId))
  const existing = new Set(current.map(row => row.userId))

  const added = [...desired].filter(userId => !existing.has(userId))
  const removed = [...existing].filter(userId => !desired.has(userId))
  if (added.length === 0 && removed.length === 0) return

  if (added.length > 0) {
    await db.userRoleAssignment.createMany({
      data: added.map(userId => ({ userId, roleId: committee.id, congregationId, kind: 'member' })),
      skipDuplicates: true,
    })
  }
  if (removed.length > 0) {
    await db.userRoleAssignment.deleteMany({
      where: { roleId: committee.id, congregationId, userId: { in: removed } },
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
