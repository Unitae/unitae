# Notification System

## Overview

Unitae has an event-driven notification system with debouncing, cancellation, and role-based recipient resolution. Notifications are triggered by business logic, buffered in PostgreSQL, and delivered as emails via the BullMQ email queue.

**Feature-owned definitions.** Each notification type is declared by the *feature that owns the domain event* — territories owns `territory.sync.completed`, display-board owns `board.document.*`, and so on. The notifications feature is a pipeline: it aggregates definitions into a central registry, handles debounce/cancellation/preferences, and delivers emails. It does not know about any specific notification's payload or template.

## Architecture

**Registry assembly (module load time)**:

```
~/features/territories/server/notifications.server.tsx
    (defineNotificationType({...}))                    ─┐
                                                        │
~/features/display-board/server/notifications.server.tsx│
    (defineNotificationType({...}))                    ─┴──▶  NOTIFICATION_REGISTRY
                                                                (registry.server.ts)
                                                                       │
        ┌──────────────────────────────────────────────────────────────┼────────────────────────────┐
        ▼                                          ▼                    ▼                            ▼
NOTIFICATION_TYPES                    renderNotificationEmail    derivePreferenceCategories    Load-time guards:
(routing config, derived)             (lookup + delegate)        (preferences UI shape)        dupe check, cancels ref
```

**Runtime dispatch** — `notify()` enqueues; the BullMQ worker renders and delivers.
Instant and debounced paths converge at the worker.

```
notify(db, params)
       │
       ▼
NOTIFICATION_REGISTRY.get(type).routing
       │
       ├── Cancellation type ──▶ Cancel pending NotificationEvent rows
       │                         (or send fallback via the instant path)
       │
       ├── Debounced (>0 min) ─▶ Insert NotificationEvent (status: pending)
       │                              │
       │                   /cron/process-notifications
       │                              │
       │                              ▼
       │                   flushSettledNotifications()
       │                     (marks rows sent, enqueues digest job)
       │                              │
       └── Instant (0 min) ─────┐     │
                                ▼     ▼
                         emailQueue.add(...)
                     ('notification-instant' or
                      'notification-digest')
                                │
                                ▼   (BullMQ worker)
                       handleEmailWork(job)
                                │
                                ▼
                        resolveRecipients() + preference filter
                                │
                                ▼
                        renderNotificationEmail()
                                │
                                ▼
                        mailer.emails.send()

Failure handling (worker side):
- Renderer returns null (unregistered / bad payload) → mark event row `failed`,
  logger.error, don't retry the job.
- Template callback throws (programmer bug) → propagate to BullMQ, job retries
  3× with exponential backoff, then dead-letters.
- mailer.emails.send throws (transient SMTP) → caught inside sendNotificationToUser,
  logger.error, event stays `sent`. BullMQ job-level retries handle re-delivery.
```

## Files

### Pipeline (notifications feature — infrastructure)

| File | Purpose |
|------|---------|
| `app/features/notifications/model/notification-definition.ts` | `NotificationTypeDefinition<T>` interface + `defineNotificationType` helper |
| `app/features/notifications/server/registry.server.ts` | Central registry — one-line-per-feature aggregation |
| `app/features/notifications/server/notification-types.server.ts` | Derived routing config map |
| `app/features/notifications/server/notify.server.ts` | `notify()` entry point |
| `app/features/notifications/server/flush-settled.server.ts` | Cron batch processor for debounced events |
| `app/features/notifications/server/resolve-recipients.server.ts` | Role-based recipient lookup + preference filtering |
| `app/features/notifications/server/preferences.server.ts` | User opt-in/opt-out management |
| `app/features/notifications/server/preference-categories.server.ts` | Derives preferences UI shape from the registry |
| `app/features/notifications/server/render-notification-email.server.tsx` | Registry lookup + delegates to `def.renderEmail` |
| `app/features/notifications/server/handle-notification-email.server.ts` | Digest/instant worker plumbing |
| `app/features/notifications/server/cleanup.server.ts` | Cleanup of old notification events |
| `app/features/notifications/routes/preferences.tsx` | Preference toggle UI |

### Definitions (consumer features — one file each)

| File | Types owned |
|------|-------------|
| `app/features/display-board/server/notifications.server.tsx` | `board.document.{created,updated,deleted,expiring}` |
| `app/features/events/server/notifications.server.tsx` | `programme.assignment.{assigned,unassigned}` |
| `app/features/territories/server/notifications.server.tsx` | `territory.sync.completed` |

Templates live alongside definitions under `app/features/<feature>/emails/`.

## Triggering Notifications

Call `notify()` from service functions after a business operation:

```typescript
import { notify } from '~/features/notifications/index.server'

await notify(db, {
  type: 'board.document.created',
  entityType: 'BoardDocument',
  entityId: document.id,
  congregationId,
  actorId: currentUser.id,
  payload: { title: document.title, documentId: document.id },
})
```

| Field | Description |
|-------|-------------|
| `type` | Must exist in `NOTIFICATION_REGISTRY` |
| `entityType` | Prisma model name (for grouping / debounceKey) |
| `entityId` | Resource ID |
| `congregationId` | Tenant ID |
| `actorId` | User who triggered the event (optional) |
| `payload` | Event-specific data, serialized to JSON (optional) — must match the definition's Zod schema |

The function is fire-and-forget — failures are logged but never block the calling operation.

## Programme assignment dispatch gate

`programme.assignment.{assigned,unassigned}` are **whitelist-gated on `Event.status === 'released'`** in `notify-assignment.server.ts` (`dispatchAssignmentDiffs`). Assignments on a draft event never call `notify()` — no `NotificationEvent` row is created, no debounce is armed, nothing shows up in the queue.

When a manager releases an event, `fireReleaseNotifications` (`app/features/events/server/event-status.server.ts`) iterates every current part / service-role assignee and calls `notifyAssignment` for each — the *same* code path that runs during a live edit, so the debounce, cancellation, and preference filter all apply uniformly. Un-releasing the event calls `unreleaseEvent`, which marks every `pending` `NotificationEvent` row targeting the event's assignments as `cancelled`.

The gate is a **whitelist, not a blacklist**: the code checks `status === Released`, not `status !== Draft`. If we ever introduce a third status (e.g. `archived`), the safe default is "don't notify". Un-release wins over release only by not running — assignments made on a draft are silent by construction, so the release-time re-fire is the single source of "you were assigned" emails.

The debounce window is intentionally short at **30 minutes** (`app/features/events/server/notifications.server.tsx`): it is a safety net for accidental releases, not a batching mechanism. Drafting removed the need for the older 2h window.

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

`resolveRecipients()` finds `UserAccount`s that should receive a notification:

1. Queries active accounts in the congregation that hold the configured permission via any of the three sources (direct `CongregationUserPermission`, account-scoped `UserRoleAssignment` → role permissions, or identity-scoped `MemberRoleAssignment` on the linked Member → role permissions). Uses `findAccountsWithPermission`, which builds the three-branch OR filter.
2. Loads `NotificationPreference` records for those accounts.
3. Filters out accounts that have disabled this notification type (exact match or wildcard `category.*`).
4. Resolves the display firstname per account (prefers linked Member's firstname over UserAccount's) via `displayFirstname`.
5. Returns the filtered list of recipients.

Members without an account are not addressable as notification recipients (no email, no preferences); the resolver naturally skips them.

## User Preferences

Users manage their preferences at `/notifications/preferences`. Preferences are stored in the `NotificationPreference` model with a compound key of `userId + notificationType + congregationId`.

The preferences UI shape is derived from `NOTIFICATION_REGISTRY` at loader time — `derivePreferenceCategories()` groups definitions by `category.key` and resolves the Paraglide label accessors. Adding a new type appears automatically.

Wildcard preferences (e.g., `board.*`) disable all notifications in a category.

## Adding a New Notification Type

Your feature owns the notification. All work lives in your feature except a single import line.

### 1. Create the React Email template

`app/features/<feature>/emails/<name>.tsx` — a React Email component with default props for the dev preview.

### 2. Add i18n keys

Add subject, body, category-label, and toggle-label keys to `app/i18n/messages/en.json` and `app/i18n/messages/fr.json`. Paraglide's typed accessors catch missing keys at compile time.

### 3. Author the definition

`app/features/<feature>/server/notifications.server.tsx`:

```tsx
import { defineNotificationType, type NotificationTypeDefinition } from '~/features/notifications'
import * as m from '~/i18n/paraglide/messages'
import { z } from 'zod'
import MyTemplate from '../emails/my-template'

const myTypeDef = defineNotificationType({
  type: 'myfeature.myentity.myaction',
  category: { key: 'myfeature', label: () => m.notification_category_myfeature() },
  label: () => m.notification_myfeature_myaction(),
  routing: {
    // See NotificationTypeConfig for the shape; other strategies include
    // 'entity-user' (recipientId passed by the caller of notify()) and the
    // cancellation-type shape used by board.document.deleted.
    debounceMinutes: 0,
    recipientStrategy: 'role',
    recipientRole: 'my-permission-key',
  },
  payload: z.object({
    someId: z.number().int().positive(),
    someName: z.string(),
  }),
  subject: (payload) => m.email_my_subject({ name: payload.someName }),
  renderEmail: ({ payload, recipient, congregation }) => (
    <MyTemplate
      email={recipient.email}
      firstname={recipient.firstname ?? undefined}
      name={payload.someName}
      deepLinkUrl={`${congregation.baseUrl}/myfeature/${payload.someId}`}
      platformName={congregation.displayName}
    />
  ),
  example: { someId: 1, someName: 'Sample' },
})

export const myfeatureNotifications: NotificationTypeDefinition<unknown>[] = [
  myTypeDef,
] as NotificationTypeDefinition<unknown>[]
```

The generic `T` flows from the Zod schema into `subject`, `renderEmail`, and `example`. Rename a payload field and TypeScript reports the mismatch at every use site.

### 4. Colocate a test

`app/features/<feature>/server/notifications.server.test.ts` — assert every definition's example parses and renders. See existing tests in `territories/` or `display-board/` for the shape. Required by `check-service-test-coverage`.

### 5. Re-export via your server barrel

`app/features/<feature>/index.server.ts`:

```typescript
export { myfeatureNotifications } from './server/notifications.server'
```

### 6. Register in the central aggregation

`app/features/notifications/server/registry.server.ts` — one import + one spread:

```typescript
import { myfeatureNotifications } from '~/features/<feature>/index.server'

const definitions: NotificationTypeDefinition<unknown>[] = [
  ...boardNotifications,
  ...territoryNotifications,
  ...myfeatureNotifications,   // ← added
]
```

### 7. Call `notify()` from your service function

```typescript
await notify(db, {
  type: 'myfeature.myentity.myaction',
  entityType: 'MyEntity',
  entityId: entity.id,
  congregationId,
  actorId: currentUser.id,
  payload: { someId: entity.id, someName: entity.name },
})
```

Done. The preferences UI toggle, the routing config, the render dispatch, and the contract test all pick up the new type from the registry — no other central files need editing.

## Anti-patterns

- **Do not** put email templates in `notifications/emails/`. Templates live with the domain that owns the event.
- **Do not** hand-edit `notification-types.server.ts` — it is derived from the registry. The preferences UI shape is derived server-side by `derivePreferenceCategories()`; `notification-preference.type.ts` holds only the view interfaces used to type the loader's return.
- **Do not** use side-effect registration (`import for effect; register()`). Module load order is unreliable; the explicit registry import list stays auditable and testable.
- **Do not** call `notify()` from a route action. Wrap it in a service function, same rule as `audit()`.

## Related

- [Background Processing](background-processing.md) — Email queue architecture
- [Email Templates](email-templates.md) — How to create email templates (React Email + Resend)
- [Cron Jobs](../self-hosting/cron-jobs.md) — `/cron/process-notifications` schedule
