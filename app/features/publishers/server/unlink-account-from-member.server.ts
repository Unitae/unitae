import { AuditAction, audit } from '~/shared/domain/audit.server'
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
): Promise<{ accountId: number; email: string } | null> {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { id: true, account: { select: { id: true, email: true } } },
  })
  if (!member) throw new NotFoundError('Member')
  if (!member.account) return null

  const { id: accountId, email } = member.account
  await db.userAccount.delete({ where: { id: accountId } })

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
