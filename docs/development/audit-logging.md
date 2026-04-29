# Audit Logging

Unitae maintains a structured audit trail of all user-facing operations. Every write that a user triggers is recorded in the `AuditLog` table with enough context to answer "who did what to which entity and when".

## How it works

`audit()` in `app/shared/domain/audit.server.ts` is fire-and-forget: it writes to the database using `unscopedDb` (bypassing RLS) and silently swallows any error so that audit failures never surface to users or block operations.

```typescript
import { audit, AuditAction } from '~/shared/domain/audit.server'

audit({
  action: AuditAction.TerritoryCreated,
  congregationId,
  actorId,            // authenticated user's id
  entityType: 'Territory',
  entityId: territory.id,
  metadata: { number: territory.number, type: territory.type },  // optional
})
```

## Adding an audit call to a new operation

1. Add a new entry to the `AuditAction` const object in `audit.server.ts`. Each entry needs a suppression comment because the naming convention rule conflicts with enum-like constants:
   ```typescript
   // biome-ignore lint/style/useNamingConvention: enum-like constant
   MyNewAction: 'my_entity.action',
   ```
2. Call `audit()` at the end of the service function, after a successful DB write. Pass `actorId` as a parameter — never read it from session inside a service.
3. Add translation keys `audit_log_action_my_entity_action` to both `app/messages/en.json` and `app/messages/fr.json`.
4. Add the action to the `translateAction` lookup in `app/features/settings/routes/audit-log.tsx` and to the filter `<select>` in the same file.
5. In unit tests that call the service function, add `vi.mock('~/shared/domain/audit.server', () => ({ audit: vi.fn(), AuditAction: {} }))` so `audit()` is a no-op.

## Action reference

### Authentication
| Action | Value |
|---|---|
| `UserLogin` | `user.login` |
| `UserLoginFailed` | `user.login.failed` |
| `UserLogout` | `user.logout` |
| `PasswordChanged` | `password.changed` |
| `PasswordResetRequested` | `password.reset.requested` |
| `ConsentGranted` | `consent.granted` |
| `ConsentWithdrawn` | `consent.withdrawn` |
| `CongregationRegistered` | `congregation.registered` |

### Users & roles
| Action | Value |
|---|---|
| `UserCreated` | `user.created` |
| `UserUpdated` | `user.updated` |
| `UserAnonymized` | `user.anonymized` |
| `UserRolesChanged` | `user.roles.changed` |
| `UserDataExported` | `user.data.exported` |
| `UserPublisherStatusChanged` | `user.publisher_status.changed` |

### Settings
| Action | Value |
|---|---|
| `GeneralSettingsUpdated` | `settings.general.updated` |
| `CongregationSettingsUpdated` | `settings.congregation.updated` |
| `EventKindUpdated` | `event_kind.updated` |
| `ProgrammeTemplateCreated` | `programme_template.created` |
| `ProgrammeTemplateUpdated` | `programme_template.updated` |
| `ProgrammeTemplateDeleted` | `programme_template.deleted` |

### Territories
| Action | Value |
|---|---|
| `TerritoryCreated` | `territory.created` |
| `TerritoryUpdated` | `territory.updated` |
| `TerritoryDeleted` | `territory.deleted` |
| `AttributionCreated` | `attribution.created` |
| `AttributionUpdated` | `attribution.updated` |
| `AttributionDeleted` | `attribution.deleted` |
| `BuildingCreated` | `building.created` |
| `BuildingUpdated` | `building.updated` |
| `BuildingDeleted` | `building.deleted` |
| `BuildingEnabled` | `building.enabled` |
| `BuildingDisabled` | `building.disabled` |

### Publishers
| Action | Value |
|---|---|
| `PublisherCreated` | `publisher.created` |
| `PublisherUpdated` | `publisher.updated` |
| `PublisherGroupCreated` | `publisher_group.created` |
| `PublisherGroupDeleted` | `publisher_group.deleted` |
| `PublisherActivityCreated` | `publisher_activity.created` |
| `PublisherActivityUpdated` | `publisher_activity.updated` |
| `PublisherActivityDeleted` | `publisher_activity.deleted` |

### Events & programmes
| Action | Value |
|---|---|
| `ProgrammeGenerated` | `programme.generated` |
| `EventCreated` | `event.created` |
| `EventUpdated` | `event.updated` |
| `EventDeleted` | `event.deleted` |
| `EventsBulkDeleted` | `events.bulk_deleted` |
| `DayOffCreated` | `day_off.created` |
| `DayOffDeleted` | `day_off.deleted` |

### Display board
| Action | Value |
|---|---|
| `BoardDocumentCreated` | `board.document.created` |
| `BoardDocumentDeleted` | `board.document.deleted` |
| `BoardDocumentsBulkDeleted` | `board.documents.bulk_deleted` |
| `BoardDocumentFileReplaced` | `board.document.file_replaced` |
| `BoardDocumentVersionCreated` | `board.document.version_created` |
| `BoardDocumentVersionRestored` | `board.document.version_restored` |
| `BoardReadStatusViewed` | `board.read_status.viewed` |

### Platform admin
| Action | Value |
|---|---|
| `PlatformCongregationUpdated` | `platform.congregation.updated` |
| `PlatformUsersListed` | `platform.users.listed` |
| `CongregationExported` | `congregation.exported` |
| `CongregationImported` | `congregation.imported` |

### Notifications
| Action | Value |
|---|---|
| `NotificationPreferenceChanged` | `notification.preference.changed` |

## Entity types and URLs

The audit log UI renders entity cells as clickable links when the entity still exists. `findAuditLogsPaginated` batch-queries each entity type with `congregationId` to check existence, then maps surviving IDs to their edit URLs.

| entityType | Edit URL |
|---|---|
| `Territory` | `/territories/territory/{id}/edit` |
| `Attribution` | `/territories/attributions/{id}/edit` |
| `Building` | `/territories/building/{id}/edit` |
| `User` | `/settings/users/{id}/edit` |
| `PublisherGroup` | `/publishers/groups/{id}/edit` |
| `ProgrammeTemplate` | `/settings/congregation/templates/{id}` |
| `Event` | `/programs/events/{id}` |
| `BoardDocument` | `/board/documents/{id}/edit` |
| `PublisherActivity` | — (no direct edit page) |
| `Congregation` | — (no direct edit page) |

## GDPR considerations

- `actorId` is always stored when an authenticated user triggers the operation. `actorEmail` is stored at write time as a snapshot.
- When a user is anonymized (`anonymizeUser`), their `actorEmail` is wiped from all `AuditLog` rows (Article 17 right to erasure). The `actorId` FK is retained so historical attribution counts are preserved.
- The UI resolves the current email from `actorId` at read time. If the email has been wiped, it falls back to "Utilisateur supprimé".
- `CongregationRegistered` is the only action without an `actorId` — the user does not yet exist when the congregation is created.
