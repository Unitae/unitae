import { AuditAction, audit } from '~/shared/domain/audit.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Toggle a Member's `isPublisher` status (publisher ↔ ministry-school student).
 *
 * Distinct from leaving the congregation (`set-member-left`). Both publisher
 * and ministry-school student are current Members; this only flips which one
 * they are.
 */
export async function togglePublisherStatus(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  isPublisher: boolean,
  actorId: number,
) {
  const member = await db.member.update({
    where: {
      id_congregationId: { id: memberId, congregationId },
    },
    data: { isPublisher },
  })

  await syncBuiltInRoleAssignments(db, memberId, congregationId, actorId)

  audit({
    action: AuditAction.PublisherStatusChanged,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
    metadata: { isPublisher },
  })

  return member
}
