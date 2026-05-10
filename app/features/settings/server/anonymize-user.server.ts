import { anonymizeAccount } from '~/features/settings/server/anonymize-account.server'
import { anonymizeMember } from '~/features/settings/server/anonymize-member.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { UserId } from '~/shared/types/branded'

/**
 * Anonymize a UserAccount and, if linked, its bound Member.
 *
 * GDPR Article 17 — right to erasure. Preserves referential integrity for
 * historical reports (activities, attributions). Thin orchestrator over
 * `anonymizeAccount` + `anonymizeMember` — those services handle each side
 * of the split independently and can be called directly when only one side
 * needs scrubbing (e.g. admin-only account with no Member).
 */
export async function anonymizeUser(db: TransactionClient, userId: UserId, requestedBy: string) {
  const account = await db.userAccount.findUnique({
    where: { id: userId },
    select: { id: true, congregationId: true, memberId: true },
  })

  if (!account) throw new NotFoundError('UserAccount')

  if (account.memberId != null) {
    await anonymizeMember(db, account.memberId, account.congregationId, requestedBy)
  }

  await anonymizeAccount(db, account.id, account.congregationId, requestedBy)
}
