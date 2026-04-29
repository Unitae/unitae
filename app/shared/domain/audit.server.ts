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

  // Authentication
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  CongregationRegistered: 'congregation.registered',

  // Settings
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  UserPublisherStatusChanged: 'user.publisher_status.changed',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  ProgrammeTemplateCreated: 'programme_template.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  ProgrammeTemplateUpdated: 'programme_template.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  ProgrammeTemplateDeleted: 'programme_template.deleted',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  GeneralSettingsUpdated: 'settings.general.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  CongregationSettingsUpdated: 'settings.congregation.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  EventKindUpdated: 'event_kind.updated',

  // Territories
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  TerritoryCreated: 'territory.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  TerritoryUpdated: 'territory.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  TerritoryDeleted: 'territory.deleted',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  AttributionCreated: 'attribution.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  AttributionUpdated: 'attribution.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  AttributionDeleted: 'attribution.deleted',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BuildingCreated: 'building.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BuildingUpdated: 'building.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BuildingDeleted: 'building.deleted',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BuildingEnabled: 'building.enabled',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BuildingDisabled: 'building.disabled',

  // Publishers
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherCreated: 'publisher.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherUpdated: 'publisher.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherGroupCreated: 'publisher_group.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherGroupDeleted: 'publisher_group.deleted',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherActivityCreated: 'publisher_activity.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherActivityUpdated: 'publisher_activity.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  PublisherActivityDeleted: 'publisher_activity.deleted',

  // Events
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  ProgrammeGenerated: 'programme.generated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  EventCreated: 'event.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  EventUpdated: 'event.updated',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  EventDeleted: 'event.deleted',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  EventsBulkDeleted: 'events.bulk_deleted',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  DayOffCreated: 'day_off.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  DayOffDeleted: 'day_off.deleted',

  // Board documents
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BoardDocumentCreated: 'board.document.created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BoardDocumentDeleted: 'board.document.deleted',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BoardDocumentsBulkDeleted: 'board.documents.bulk_deleted',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BoardDocumentFileReplaced: 'board.document.file_replaced',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BoardDocumentVersionCreated: 'board.document.version_created',
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  BoardDocumentVersionRestored: 'board.document.version_restored',

  // Notifications
  // biome-ignore lint/style/useNamingConvention: enum-like constant
  NotificationPreferenceChanged: 'notification.preference.changed',

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
