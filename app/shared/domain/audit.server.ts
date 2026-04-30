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
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BoardDocumentCreated: 'board.document.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BoardDocumentUpdated: 'board.document.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BoardDocumentDeleted: 'board.document.deleted',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BoardSectionCreated: 'board.section.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BoardSectionUpdated: 'board.section.updated',

  // Territories
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  TerritoryCreated: 'territory.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  TerritoryUpdated: 'territory.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  TerritoryDeleted: 'territory.deleted',

  // Attributions
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  AttributionCreated: 'attribution.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  AttributionUpdated: 'attribution.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  AttributionDeleted: 'attribution.deleted',

  // Publishers
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherCreated: 'publisher.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherUpdated: 'publisher.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherStatusChanged: 'publisher.status.changed',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherGroupCreated: 'publisher.group.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherGroupDeleted: 'publisher.group.deleted',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherActivityCreated: 'publisher.activity.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherActivityUpdated: 'publisher.activity.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherActivityDeleted: 'publisher.activity.deleted',

  // Congregation settings
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  CongregationSettingsUpdated: 'congregation.settings.updated',

  // Data transfer
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  CongregationExported: 'congregation.exported',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  CongregationImported: 'congregation.imported',

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
