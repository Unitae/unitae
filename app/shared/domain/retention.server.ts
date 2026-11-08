import { cleanupNotificationEvents } from '~/features/notifications/server/cleanup.server'
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
 * Supprime le suivi de lecture des documents dont la visibilite a expire depuis plus d'un an.
 * Evite de conserver indefiniment des donnees comportementales.
 */
export async function cleanupExpiredDocumentViewTracking(): Promise<number> {
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const expired = { visibleUntil: { not: null, lt: oneYearAgo } }

  const { count } = await unscopedDb.boardDocumentView.deleteMany({ where: { document: expired } })

  // The implicit `viewedBy` join still holds a copy of the reads made before their date was kept,
  // until a later migration drops it. Clear it for the same documents, so an expired read leaves
  // both tables. Prisma cannot clear an implicit relation across rows in one `updateMany`, so the
  // writes stay per document, and only for documents that still hold reads there.
  const legacy = await unscopedDb.boardDocument.findMany({
    where: { ...expired, viewedBy: { some: {} } },
    select: { id: true },
  })
  for (const document of legacy) {
    await unscopedDb.boardDocument.update({ where: { id: document.id }, data: { viewedBy: { set: [] } } })
  }

  if (count > 0) {
    logger.info(`Cleaned up ${count} view tracking entries for documents expired over a year ago`)
  }

  return count
}

/**
 * Execute toutes les taches de nettoyage de retention des donnees.
 */
export async function runRetentionCleanup(): Promise<{
  tokens: number
  consents: number
  viewTracking: number
  notifications: number
}> {
  const tokens = await cleanupExpiredPasswordResetTokens()
  const consents = await cleanupOldWithdrawnConsents()
  const viewTracking = await cleanupExpiredDocumentViewTracking()
  const notifications = await cleanupNotificationEvents()

  return { tokens, consents, viewTracking, notifications }
}
