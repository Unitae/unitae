import { randomUUID } from 'node:crypto'
import { requireNotLastAdmin } from '~/shared/auth/permissions.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Anonymize a UserAccount: scramble the email, clear password and display
 * name, mark inactive, stamp `anonymizedAt`. Strips direct permission grants
 * and password-reset tokens. Detaches from board document version uploads
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
  accountId: number,
  congregationId: number,
  requestedBy: string,
) {
  const account = await db.userAccount.findFirst({
    where: { id: accountId, congregationId },
    select: { id: true, anonymizedAt: true },
  })

  if (!account) throw new NotFoundError('UserAccount')
  if (account.anonymizedAt) throw new ConflictError('Account already anonymized')

  await requireNotLastAdmin(accountId, congregationId)

  const anonymizedEmail = `deleted-${randomUUID()}@anonymized.local`

  await db.userAccount.update({
    where: { id: accountId },
    data: {
      firstname: null,
      lastname: null,
      email: anonymizedEmail,
      password: '',
      active: false,
      anonymizedAt: new Date(),
    },
  })

  await db.congregationUserPermission.deleteMany({ where: { userId: accountId } })
  await db.passwordResetToken.deleteMany({ where: { userId: accountId } })

  await db.boardDocumentVersion.updateMany({
    where: { uploadedById: accountId },
    data: { uploadedById: null },
  })

  await db.dataDeletionRecord.create({
    data: {
      entityType: 'UserAccount',
      entityId: accountId,
      congregationId,
      requestedBy,
      completedAt: new Date(),
    },
  })
}
