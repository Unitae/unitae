import type { TransactionClient } from '~/shared/infra/db.server'
import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

export const AuditAction = {
  // Authentication
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  UserLogin: 'user.login',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  UserLoginFailed: 'user.login.failed',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  UserLogout: 'user.logout',

  // User management
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  UserCreated: 'user.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  UserUpdated: 'user.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  UserAnonymized: 'user.anonymized',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  UserRolesChanged: 'user.roles.changed',

  // Data export
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  UserDataExported: 'user.data.exported',

  // Consent
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  ConsentGranted: 'consent.granted',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  ConsentWithdrawn: 'consent.withdrawn',

  // Password
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PasswordChanged: 'password.changed',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PasswordResetRequested: 'password.reset.requested',

  // Board
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BoardReadStatusViewed: 'board.read_status.viewed',

  // Platform admin
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PlatformCongregationUpdated: 'platform.congregation.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PlatformUsersListed: 'platform.users.listed',
} as const

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction]

interface AuditEntry {
  action: AuditAction
  congregationId: number
  actorId?: number
  actorEmail?: string
  entityType?: string
  entityId?: number
  metadata?: Record<string, unknown>
}

/**
 * Enregistre un evenement dans le journal d'audit.
 * Utilise unscopedDb pour ecrire sans contexte RLS (l'audit est transversal).
 * Ne lance jamais d'exception — les erreurs d'audit ne doivent pas bloquer les operations.
 */
export function audit(entry: AuditEntry): void {
  unscopedDb.auditLog
    .create({
      data: {
        action: entry.action,
        congregationId: entry.congregationId,
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      },
    })
    .catch(error => {
      logger.error('Failed to write audit log', { error, auditAction: entry.action })
    })
}

/**
 * Enregistre un evenement d'audit dans une transaction existante.
 */
export function auditInTransaction(tx: TransactionClient, entry: AuditEntry) {
  return tx.auditLog.create({
    data: {
      action: entry.action,
      congregationId: entry.congregationId,
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail ?? null,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    },
  })
}
