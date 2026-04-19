import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

/**
 * Supprime les tokens de reinitialisation de mot de passe expires.
 * Les tokens expirent apres 24h mais ne sont pas nettoyes automatiquement.
 */
export async function cleanupExpiredPasswordResetTokens(): Promise<number> {
  const result = await unscopedDb.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })

  if (result.count > 0) {
    logger.info(`Cleaned up ${result.count} expired password reset tokens`)
  }

  return result.count
}

/**
 * Supprime les enregistrements de consentement retires depuis plus de 2 ans.
 * Article 5(1)(e) RGPD — limitation de la conservation.
 */
export async function cleanupOldWithdrawnConsents(): Promise<number> {
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  const result = await unscopedDb.consentRecord.deleteMany({
    where: {
      withdrawnAt: { not: null, lt: twoYearsAgo },
    },
  })

  if (result.count > 0) {
    logger.info(`Cleaned up ${result.count} consent records withdrawn more than 2 years ago`)
  }

  return result.count
}

/**
 * Supprime les entrees de suivi de lecture (viewedBy) pour les documents
 * dont la visibilite a expire depuis plus d'un an.
 * Evite de conserver indefiniment des donnees comportementales.
 */
export async function cleanupExpiredDocumentViewTracking(): Promise<number> {
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  // Find documents that expired more than 1 year ago
  const expiredDocuments = await unscopedDb.boardDocument.findMany({
    where: {
      visibleUntil: { not: null, lt: oneYearAgo },
    },
    select: { id: true },
  })

  if (expiredDocuments.length === 0) return 0

  // Disconnect all viewedBy entries for these documents
  let cleaned = 0
  for (const doc of expiredDocuments) {
    const document = await unscopedDb.boardDocument.findUnique({
      where: { id: doc.id },
      select: { viewedBy: { select: { id: true } } },
    })

    if (document && document.viewedBy.length > 0) {
      await unscopedDb.boardDocument.update({
        where: { id: doc.id },
        data: {
          viewedBy: {
            set: [],
          },
        },
      })
      cleaned += document.viewedBy.length
    }
  }

  if (cleaned > 0) {
    logger.info(`Cleaned up ${cleaned} view tracking entries for ${expiredDocuments.length} expired documents`)
  }

  return cleaned
}

/**
 * Execute toutes les taches de nettoyage de retention des donnees.
 */
export async function runRetentionCleanup(): Promise<{ tokens: number; consents: number; viewTracking: number }> {
  const tokens = await cleanupExpiredPasswordResetTokens()
  const consents = await cleanupOldWithdrawnConsents()
  const viewTracking = await cleanupExpiredDocumentViewTracking()

  return { tokens, consents, viewTracking }
}
