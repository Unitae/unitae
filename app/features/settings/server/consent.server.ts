import type { TransactionClient } from '~/shared/libs/db.server'
import { unscopedDb } from '~/shared/libs/db.server'

export const CONSENT_VERSION = '1.0'

export const ConsentPurpose = {
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  DataProcessing: 'DATA_PROCESSING',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  EmailNotifications: 'EMAIL_NOTIFICATIONS',
} as const

export type ConsentPurpose = (typeof ConsentPurpose)[keyof typeof ConsentPurpose]

/**
 * Enregistre un consentement pour un utilisateur.
 * Utilise unscopedDb car appele lors de l'inscription (pas de contexte congregation).
 */
export function recordConsentUnscoped(
  userId: number,
  congregationId: number,
  purpose: ConsentPurpose,
  ipAddress?: string,
) {
  return unscopedDb.consentRecord.create({
    data: {
      userId,
      congregationId,
      purpose,
      consentVersion: CONSENT_VERSION,
      ipAddress: ipAddress ?? null,
    },
  })
}

/**
 * Enregistre un consentement dans un contexte scope (transaction RLS).
 */
export function recordConsent(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  purpose: ConsentPurpose,
  ipAddress?: string,
) {
  return db.consentRecord.create({
    data: {
      userId,
      congregationId,
      purpose,
      consentVersion: CONSENT_VERSION,
      ipAddress: ipAddress ?? null,
    },
  })
}

/**
 * Retire un consentement (enregistre la date de retrait).
 */
export async function withdrawConsent(db: TransactionClient, userId: number, purpose: ConsentPurpose) {
  const record = await db.consentRecord.findFirst({
    where: { userId, purpose, withdrawnAt: null },
    orderBy: { consentedAt: 'desc' },
  })

  if (!record) return null

  return db.consentRecord.update({
    where: { id: record.id },
    data: { withdrawnAt: new Date() },
  })
}

/**
 * Recupere tous les consentements actifs d'un utilisateur.
 */
export function getActiveConsents(db: TransactionClient, userId: number) {
  return db.consentRecord.findMany({
    where: { userId, withdrawnAt: null },
    orderBy: { consentedAt: 'desc' },
  })
}

/**
 * Verifie si un utilisateur a donne son consentement au traitement des donnees.
 * Utilise unscopedDb car appele avant l'etablissement du contexte congregation.
 */
export async function hasDataProcessingConsent(userId: number): Promise<boolean> {
  const record = await unscopedDb.consentRecord.findFirst({
    where: { userId, purpose: ConsentPurpose.DataProcessing, withdrawnAt: null },
  })
  return record != null
}
