import type { TransactionClient } from '~/shared/infra/db.server'
import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

export const AuditAction = {
  // Authentication
  UserLogin: 'user.login',
  UserLoginFailed: 'user.login.failed',
  UserLogout: 'user.logout',

  // Two-factor authentication
  TwoFactorEnabled: 'two_factor.enabled',
  TwoFactorDisabled: 'two_factor.disabled',
  TwoFactorChallengeFailed: 'two_factor.challenge.failed',
  TwoFactorReset: 'two_factor.reset',

  // User management
  UserCreated: 'user.created',
  UserUpdated: 'user.updated',
  UserAnonymized: 'user.anonymized',
  RetentionAutoAnonymized: 'retention.auto_anonymized',
  UserPermissionsChanged: 'user.permissions.changed',
  RoleAssignmentsSynced: 'role.assignments.synced',
  UserRoleAssignmentChanged: 'user.role_assignment.changed',

  // Roles
  RoleCreated: 'role.created',
  RoleUpdated: 'role.updated',
  RoleDeleted: 'role.deleted',
  RolePermissionChanged: 'role.permission.changed',
  PartAllowedRolesChanged: 'part.allowed_roles.changed',
  ServicePartAllowedRolesChanged: 'service_role.allowed_roles.changed',

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
  BoardSectionVisibilityChanged: 'board.section.visibility.changed',

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
  EmergencyInfoUpdated: 'emergency_info.updated',

  // Pioneer goals
  PioneerGoalUpdated: 'pioneer_goal.updated',

  // Member lifecycle
  MemberLeft: 'member.left',
  MemberReturned: 'member.returned',
  PublisherInactivated: 'publisher.inactivated',
  PublisherReactivated: 'publisher.reactivated',

  // Account / Member linking
  AccountLinkedToMember: 'account.linked_to_member',
  AccountUnlinkedFromMember: 'account.unlinked_from_member',
  AccountDeleted: 'account.deleted',

  // Congregation settings
  CongregationSettingsUpdated: 'congregation.settings.updated',

  // Data transfer
  CongregationExported: 'congregation.exported',
  CongregationImported: 'congregation.imported',

  // Territory card overlays
  CardOverlayCreated: 'card_overlay.created',
  CardOverlayUpdated: 'card_overlay.updated',
  CardOverlayDeleted: 'card_overlay.deleted',

  // Territory perimeter
  PerimeterUpdated: 'perimeter.updated',
  PerimeterCleared: 'perimeter.cleared',

  // External speakers
  ExternalSpeakerCreated: 'external_speaker.created',
  ExternalSpeakerUpdated: 'external_speaker.updated',
  ExternalSpeakerArchived: 'external_speaker.archived',
  ExternalSpeakerUnarchived: 'external_speaker.unarchived',

  // Programme events
  EventReleased: 'event.released',
  EventUnreleased: 'event.unreleased',
  EventDeleted: 'event.deleted',
  EventUpdated: 'event.updated',

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

const pendingAuditWrites = new Set<Promise<unknown>>()

/**
 * Enregistre un evenement dans le journal d'audit.
 * Utilise unscopedDb pour ecrire sans contexte RLS (l'audit est transversal).
 * Ne lance jamais d'exception — les erreurs d'audit ne doivent pas bloquer les operations.
 */
export function audit(entry: AuditEntry): void {
  const promise = unscopedDb.auditLog
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
    .finally(() => {
      pendingAuditWrites.delete(promise)
    })
  pendingAuditWrites.add(promise)
}

/**
 * Awaits all fire-and-forget `audit()` writes started so far. Test-only — production code
 * intentionally lets audit writes settle in the background.
 */
export async function flushPendingAuditWrites(): Promise<void> {
  await Promise.all(pendingAuditWrites)
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
