import { randomUUID } from 'node:crypto'

import type { TransactionClient } from '~/shared/libs/db.server'

/**
 * Anonymise un utilisateur en remplacant toutes les donnees personnelles
 * par des valeurs non identifiables. Preserve l'integrite referentielle
 * pour les rapports historiques (activites, attributions).
 *
 * Article 17 du RGPD — Droit a l'effacement.
 */
export async function anonymizeUser(db: TransactionClient, userId: number, requestedBy: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, anonymizedAt: true, congregationId: true },
  })

  if (!user) {
    throw new Error(`Utilisateur introuvable : ${userId}`)
  }

  if (user.anonymizedAt) {
    throw new Error(`Utilisateur deja anonymise : ${userId}`)
  }

  const anonymizedEmail = `deleted-${randomUUID()}@anonymized.local`

  // Anonymiser les donnees personnelles
  await db.user.update({
    where: { id: userId },
    data: {
      firstname: 'Utilisateur',
      lastname: 'supprime',
      email: anonymizedEmail,
      password: '',
      phone: null,
      address: null,
      birthDate: null,
      baptismDate: null,
      isMale: null,
      isHelder: false,
      isServant: false,
      isAnointed: false,
      isPublisher: false,
      active: false,
      anonymizedAt: new Date(),
    },
  })

  // Supprimer les roles de l'utilisateur
  await db.congregationUserRole.deleteMany({
    where: { userId },
  })

  // Supprimer les tokens de reinitialisation
  await db.passwordResetToken.deleteMany({
    where: { userId },
  })

  // Enregistrer dans le registre de suppression (reconciliation des sauvegardes)
  await db.dataDeletionRecord.create({
    data: {
      entityType: 'User',
      entityId: userId,
      congregationId: user.congregationId,
      requestedBy,
      completedAt: new Date(),
    },
  })
}
