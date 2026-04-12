import { unscopedDb } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

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
 * Execute toutes les taches de nettoyage de retention des donnees.
 */
export async function runRetentionCleanup(): Promise<{ tokens: number; consents: number }> {
  const tokens = await cleanupExpiredPasswordResetTokens()
  const consents = await cleanupOldWithdrawnConsents()

  return { tokens, consents }
}
