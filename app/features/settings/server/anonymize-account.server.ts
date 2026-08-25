import { randomUUID } from 'node:crypto'
import { requireNotLastAdmin } from '~/shared/auth/permissions.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { AccountId } from '~/shared/types/branded'

/**
 * Anonymize a UserAccount: scramble the email, clear password and display
 * name, mark inactive, stamp `anonymizedAt`. Strips role assignments — which
 * since #149 is what actually revokes access — and password-reset tokens. Detaches from board document version uploads
 * (FK is `onDelete: SetNull` on delete, but anonymization keeps the row, so
 * we null the FK explicitly).
 *
 * The optional 1:1 link to a `Member` is preserved — call `anonymizeMember`
 * separately to scrub the person side. This split lets admins anonymize an
 * account that has no Member (CO / external admin) without touching member
 * tables, and vice versa.
 */
export async function anonymizeAccount(
  db: TransactionClient,
  accountId: AccountId,
  congregationId: number,
  actorId: number,
): Promise<void> {
  const account = await db.userAccount.findFirst({
    where: { id: accountId, congregationId },
    select: { id: true, anonymizedAt: true },
  })

  if (!account) throw new NotFoundError('UserAccount')
  if (account.anonymizedAt) throw new ConflictError('Account already anonymized')

  await requireNotLastAdmin(accountId, congregationId)

  const anonymizedEmail = `deleted-${randomUUID()}@anonymized.local`

  await db.userAccount.update({
    where: { id_congregationId: { id: accountId, congregationId } },
    data: {
      firstname: null,
      lastname: null,
      email: anonymizedEmail,
      password: '',
      active: false,
      anonymizedAt: new Date(),
    },
  })

  await db.userRoleAssignment.deleteMany({ where: { userId: accountId, congregationId } })
  // PasswordResetToken has no congregationId column (account-bound); scoped via the verified account above.
  await db.passwordResetToken.deleteMany({ where: { userId: accountId } })

  await db.boardDocumentVersion.updateMany({
    where: { uploadedById: accountId, congregationId },
    data: { uploadedById: null },
  })

  await db.dataDeletionRecord.create({
    data: {
      entityType: 'UserAccount',
      entityId: accountId,
      congregationId,
      requestedBy: `admin:${actorId}`,
      completedAt: new Date(),
    },
  })

  audit({
    action: AuditAction.UserAnonymized,
    congregationId,
    actorId,
    entityType: 'UserAccount',
    entityId: accountId,
  })
}
