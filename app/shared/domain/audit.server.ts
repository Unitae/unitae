import type { TransactionClient } from '~/shared/infra/db.server'
import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

export const AuditAction = {
  // Authentication
  UserLogin: 'user.login',
  UserLoginFailed: 'user.login.failed',
  UserLogout: 'user.logout',

  // User management
  UserCreated: 'user.created',
  UserUpdated: 'user.updated',
  UserAnonymized: 'user.anonymized',
  UserRolesChanged: 'user.roles.changed',

  // Data export
  UserDataExported: 'user.data.exported',

  // Consent
  ConsentGranted: 'consent.granted',
  ConsentWithdrawn: 'consent.withdrawn',

  // Password
  PasswordChanged: 'password.changed',
  PasswordResetRequested: 'password.reset.requested',

  // Calendar feed
  CalendarFeedTokenCreated: 'calendar_feed.token.created',
  CalendarFeedTokenRevoked: 'calendar_feed.token.revoked',

  // Board
  BoardReadStatusViewed: 'board.read_status.viewed',
  BoardDocumentCreated: 'board.document.created',
  BoardDocumentUpdated: 'board.document.updated',
  BoardDocumentDeleted: 'board.document.deleted',
  BoardSectionCreated: 'board.section.created',
  BoardSectionUpdated: 'board.section.updated',

  // Territories
  TerritoryCreated: 'territory.created',
  TerritoryUpdated: 'territory.updated',
  TerritoryDeleted: 'territory.deleted',
  EntranceReassigned: 'entrance.reassigned',

  // Attributions
  AttributionCreated: 'attribution.created',
  AttributionUpdated: 'attribution.updated',
  AttributionDeleted: 'attribution.deleted',

  // Publishers
  PublisherCreated: 'publisher.created',
  PublisherUpdated: 'publisher.updated',
  PublisherStatusChanged: 'publisher.status.changed',
  PublisherGroupCreated: 'publisher.group.created',
  PublisherGroupDeleted: 'publisher.group.deleted',
  PublisherActivityCreated: 'publisher.activity.created',
  PublisherActivityUpdated: 'publisher.activity.updated',
  PublisherActivityDeleted: 'publisher.activity.deleted',

  // Congregation settings
  CongregationSettingsUpdated: 'congregation.settings.updated',

  // Data transfer
  CongregationExported: 'congregation.exported',
  CongregationImported: 'congregation.imported',

  // External speakers
  ExternalSpeakerCreated: 'external_speaker.created',
  ExternalSpeakerUpdated: 'external_speaker.updated',
  ExternalSpeakerArchived: 'external_speaker.archived',
  ExternalSpeakerUnarchived: 'external_speaker.unarchived',

  // Platform admin
  PlatformCongregationUpdated: 'platform.congregation.updated',
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
