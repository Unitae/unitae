# Notification System

## Overview

Unitae has an event-driven notification system with debouncing, cancellation, and role-based recipient resolution. Notifications are triggered by business logic, buffered in PostgreSQL, and delivered as emails via the BullMQ email queue.

## Architecture

```
notify(db, params)
       │
       ▼
 NOTIFICATION_TYPES[type]
       │
       ├── Cancellation type ──▶ Cancel pending events (or send fallback)
       ├── Debounced (>0 min) ─▶ Store in PostgreSQL (NotificationEvent)
       │                              │
       │                   /cron/process-notifications
       │                              │
       │                              ▼
       │                   flushSettledNotifications()
       │                              │
       └── Instant (0 min) ──────────▶├──▶ emailQueue job
                                      │    ('notification-digest' or
                                      │     'notification-instant')
                                      ▼
                              resolveRecipients()
                              Filter by NotificationPreference
                                      │
                                      ▼
                              renderNotificationEmail()
                              mailer.emails.send()
```

## Files

| File | Purpose |
|------|---------|
| `app/features/notifications/server/notification-types.server.ts` | Registry of all notification type configs |
| `app/features/notifications/server/notify.server.ts` | Entry point — routes notification based on config |
| `app/features/notifications/server/flush-settled.server.ts` | Cron batch processor for debounced events |
| `app/features/notifications/server/resolve-recipients.server.ts` | Role-based recipient lookup + preference filtering |
| `app/features/notifications/server/preferences.server.ts` | User opt-in/opt-out management |
| `app/features/notifications/server/handle-notification-email.server.tsx` | Email rendering and sending (digest + instant) |
| `app/features/notifications/server/cleanup.server.ts` | Cleanup of old notification events |
| `app/features/notifications/routes/preferences.tsx` | Preference toggle UI |

## Notification Type Registry

All notification types are defined in `notification-types.server.ts`:

```typescript
export const NOTIFICATION_TYPES: Record<string, NotificationTypeConfig> = {
  'board.document.created': {
    debounceMinutes: 10,
    recipientStrategy: 'role',
    recipientRole: 'board-validator',
  },
  'board.document.deleted': {
    cancels: ['board.document.created', 'board.document.updated'],
    fallback: { debounceMinutes: 0, recipientStrategy: 'role', recipientRole: 'board-validator' },
  },
}
```

Each type has:

- **`debounceMinutes`** — How long to buffer before sending. `0` = instant.
- **`recipientStrategy`** — How to find recipients (`'role'`).
- **`recipientRole`** — Which congregation role receives this notification.
- **`cancels`** (optional) — List of notification types this one supersedes. If pending events exist for those types + same entity, they are cancelled instead of sending a new email.
- **`fallback`** (optional) — Config to use if no pending events were found to cancel.

### Type naming convention

Types use dot-notation: `{category}.{entity}.{action}` (e.g., `board.document.created`). The first segment (`board`) is used as the category for wildcard preferences.

## Triggering Notifications

Call `notify()` from service functions after a business operation:

```typescript
import { notify } from '~/features/notifications/server/notify.server'

await notify(db, {
  type: 'board.document.created',
  entityType: 'BoardDocument',
  entityId: document.id,
  congregationId,
  actorId: currentUser.id,
  payload: { title: document.title, documentId: document.id },
})
```

Parameters:

| Field | Description |
|-------|-------------|
| `type` | Must exist in `NOTIFICATION_TYPES` |
| `entityType` | Prisma model name (for grouping) |
| `entityId` | Resource ID |
| `congregationId` | Tenant ID |
| `actorId` | User who triggered the event (optional) |
| `payload` | Event-specific data, serialized to JSON (optional) |

The function is fire-and-forget — failures are logged but never block the calling operation.

## Debounce & Flush

When `debounceMinutes > 0`, `notify()` creates a `NotificationEvent` row in PostgreSQL with `status: 'pending'` and `debounceUntil` set to `now + debounceMinutes`.

The `/cron/process-notifications` endpoint calls `flushSettledNotifications()`, which:

1. Fetches up to 500 pending events where `debounceUntil <= now` (with `FOR UPDATE SKIP LOCKED`)
2. Groups events by congregation, recipient, and type category
3. Pushes `notification-digest` jobs to the email queue
4. Marks events as `status: 'sent'`

This endpoint should be called every 5–10 minutes. See [Cron Jobs](../self-hosting/cron-jobs.md).

## Cancellation

Cancellation types (e.g., `board.document.deleted`) attempt to cancel pending debounced events for the same entity. If matching pending events are found, they are marked as cancelled. If none are found, the `fallback` config is used to send a notification instead.

## Recipient Resolution

`resolveRecipients()` finds users who should receive a notification:

1. Queries all active users with the required role in the congregation
2. Loads `NotificationPreference` records for those users
3. Filters out users who have disabled this notification type (exact match or wildcard `category.*`)
4. Returns the filtered list of recipients

## User Preferences

Users manage their preferences at `/notifications/preferences`. Preferences are stored in the `NotificationPreference` model with a compound key of `userId + notificationType + congregationId`.

Wildcard preferences (e.g., `board.*`) disable all notifications in a category.

## Adding a New Notification Type

1. **Register the type** in `notification-types.server.ts`:
   ```typescript
   'territories.sync.completed': {
     debounceMinutes: 0,
     recipientStrategy: 'role',
     recipientRole: 'territories-manager',
   },
   ```

2. **Create an email template** in `app/emails/notifications/` (see [Email Templates](email-templates.md))

3. **Add the rendering case** in `handle-notification-email.server.tsx`:
   ```typescript
   case 'territories.sync.completed':
     return {
       subject: m.email_sync_completed_subject(),
       react: <SyncCompleted {...props} />,
     }
   ```

4. **Add i18n messages** for the subject and template content in `app/messages/en.json` and `app/messages/fr.json`

5. **Call `notify()`** from the relevant service function

6. **Update the preferences UI** if the new type should appear in user preference settings

## Related

- [Background Processing](background-processing.md) — Email queue architecture
- [Email Templates](email-templates.md) — How to create email templates
- [Cron Jobs](../self-hosting/cron-jobs.md) — `/cron/process-notifications` schedule
