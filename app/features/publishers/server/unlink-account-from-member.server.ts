import { requireNotLastAdmin } from '~/shared/auth/permissions.server'
import { assertMayActOnAccount } from '~/shared/domain/account-protection.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { ActorPermissions } from '~/shared/domain/role-grant-limits.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'

/**
 * Remove the login from a Member: deletes the linked UserAccount entirely
 * (tokens + permissions + management role assignments cascade via FK
 * onDelete). The Member row itself stays in place — the person is still
 * part of the congregation, just without a way to log in.
 *
 * Returns the deleted account's `id` and `email` so callers can flash a
 * confirmation without a second lookup. `null` when the Member had no
 * linked account.
 */
export async function unlinkAccountFromMember(
  db: TransactionClient,
  memberId: MemberId,
  congregationId: number,
  actorId: number,
  actorPermissions: ActorPermissions,
): Promise<{ accountId: number; email: string } | null> {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { id: true, account: { select: { id: true, email: true } } },
  })
  if (!member) throw new NotFoundError('Member')
  if (!member.account) return null

  const { id: accountId, email } = member.account
  // Taking a login away deletes the account: the same rules as deleting it from Réglages.
  await assertMayActOnAccount({ accountId, actorId, congregationId, actorPermissions, action: 'delete' })
  await requireNotLastAdmin(accountId, congregationId)
  await db.userAccount.delete({ where: { id_congregationId: { id: accountId, congregationId } } })

  audit({
    action: AuditAction.AccountUnlinkedFromMember,
    congregationId,
    actorId,
    entityType: 'UserAccount',
    entityId: accountId,
    metadata: { memberId, email },
  })

  return { accountId, email }
}
