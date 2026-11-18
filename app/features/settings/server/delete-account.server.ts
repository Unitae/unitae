import { EventTemplateKey } from '~/features/events'
import { requireNotLastAdmin } from '~/shared/auth/permissions.server'
import { assertMayActOnAccount } from '~/shared/domain/account-protection.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { ActorPermissions } from '~/shared/domain/role-grant-limits.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { AccountId } from '~/shared/types/branded'

/**
 * Refused: the account is linked to a record and has absences. They are the person's, not the login's, and are kept
 * until they can be handed to the record.
 */
export class AccountHasAbsencesError extends ConflictError {}

/**
 * Delete a UserAccount. If a Member is linked (`memberId != null`), the
 * Member row is preserved — the person stays in the congregation, they just
 * lose their login. Tokens, permissions, and `UserRoleAssignment` rows
 * cascade via FK `onDelete`.
 *
 * The events it created: its absences go with an account that has no record (nobody else is away on them); an account
 * with a record and absences is refused (AccountHasAbsencesError). Its other events lose their author and keep their
 * origin, so a hand-made one never becomes an empty meeting a template may move or delete.
 *
 * For anonymization (keep the row, scrub PII) call `anonymizeAccount` instead.
 * This service is the destructive variant.
 */
export async function deleteAccount(
  db: TransactionClient,
  accountId: AccountId,
  congregationId: number,
  actorId: number,
  actorPermissions: ActorPermissions,
) {
  const account = await db.userAccount.findFirst({
    where: { id: accountId, congregationId },
    select: { id: true, email: true, memberId: true },
  })
  if (!account) throw new NotFoundError('UserAccount')

  // Nobody deletes their own account; an administrator's is handled by administrators only.
  await assertMayActOnAccount({ accountId, actorId, congregationId, actorPermissions, action: 'delete' })
  await requireNotLastAdmin(accountId, congregationId)

  const absences = { congregationId, createdById: accountId, template: { key: EventTemplateKey.DayOff } }
  if (account.memberId != null && (await db.event.count({ where: absences })) > 0) {
    throw new AccountHasAbsencesError('The account has absences')
  }
  // An absence only flags the assignments of its person's record: one without a record has flagged nothing.
  const absencesDeleted = (await db.event.deleteMany({ where: absences })).count
  await db.event.updateMany({ where: { congregationId, createdById: accountId }, data: { createdById: null } })

  await db.userAccount.delete({ where: { id_congregationId: { id: accountId, congregationId } } })

  audit({
    action: AuditAction.AccountDeleted,
    congregationId,
    actorId,
    entityType: 'UserAccount',
    entityId: accountId,
    metadata: { email: account.email, memberId: account.memberId, absencesDeleted },
  })

  return { accountId, memberId: account.memberId }
}
