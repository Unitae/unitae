import { randomUUID } from 'node:crypto'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { UserId } from '~/shared/types/branded'

/**
 * Anonymise un utilisateur en remplacant toutes les donnees personnelles
 * par des valeurs non identifiables. Preserve l'integrite referentielle
 * pour les rapports historiques (activites, attributions).
 *
 * Article 17 du RGPD — Droit a l'effacement.
 *
 * `userId` is a UserAccount id. The bound Member, if any, is anonymized in
 * place: PII is scrubbed, `anonymizedAt` is stamped, but the row is kept so
 * `PublisherActivity` aggregates still work. The UserAccount's email is
 * scrambled, password cleared, and active set to false.
 */
export async function anonymizeUser(db: TransactionClient, userId: UserId, requestedBy: string) {
  const account = await db.userAccount.findUnique({
    where: { id: userId },
    select: { id: true, anonymizedAt: true, congregationId: true, memberId: true },
  })

  if (!account) {
    throw new Error(`Utilisateur introuvable : ${userId}`)
  }

  if (account.anonymizedAt) {
    throw new Error(`Utilisateur deja anonymise : ${userId}`)
  }

  const anonymizedEmail = `deleted-${randomUUID()}@anonymized.local`

  // Anonymize the UserAccount: scramble email, clear password and display name,
  // mark inactive, stamp anonymizedAt.
  await db.userAccount.update({
    where: { id: userId },
    data: {
      firstname: null,
      lastname: null,
      email: anonymizedEmail,
      password: '',
      active: false,
      anonymizedAt: new Date(),
    },
  })

  // Strip permissions, password reset tokens (other tokens cascade with the
  // account but PasswordResetToken is preserved on cascade so explicit cleanup).
  await db.congregationUserPermission.deleteMany({ where: { userId } })
  await db.passwordResetToken.deleteMany({ where: { userId } })

  // Detach from board document version uploads — already onDelete: SetNull on
  // delete, but anonymization keeps the account around. Null out the FK so the
  // version isn't tied to an anonymized identity.
  await db.boardDocumentVersion.updateMany({
    where: { uploadedById: userId },
    data: { uploadedById: null },
  })

  if (account.memberId != null) {
    // Anonymize the linked Member: scrub PII, clear flags, mark anonymized.
    // isPublisher and type are kept so PublisherActivity rows aggregate
    // correctly. Drop deputy assignment (deputyId is nullable); responsible
    // role would orphan a group, so left as-is — the Member row remains
    // referenced under the anonymized identity.
    await db.member.update({
      where: { id: account.memberId },
      data: {
        firstname: 'Utilisateur',
        lastname: 'supprime',
        phone: '',
        address: '',
        birthDate: null,
        baptismDate: null,
        isMale: null,
        isHelder: false,
        isServant: false,
        isAnointed: false,
        anonymizedAt: new Date(),
      },
    })

    await db.publisherGroup.updateMany({
      where: { deputyId: account.memberId },
      data: { deputyId: null },
    })

    await db.attribution.updateMany({
      where: { publisherId: account.memberId, endDate: null },
      data: { endDate: new Date() },
    })

    // Re-sync identity roles — every flag is now off so all built-in role
    // assignments are removed.
    await syncBuiltInRoleAssignments(db, account.memberId, account.congregationId, null)
  }

  // Record the deletion for backup reconciliation
  await db.dataDeletionRecord.create({
    data: {
      entityType: 'User',
      entityId: userId,
      congregationId: account.congregationId,
      requestedBy,
      completedAt: new Date(),
    },
  })
}
