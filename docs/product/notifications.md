# Notifications

Unitae sends email notifications to keep congregation members informed about events that concern them. Notifications are delivered asynchronously and can be configured per user.

## Notification Types

| Type | Trigger | Recipients | Delay |
|------|---------|-----------|-------|
| **New document on board** | A document is uploaded to the display board | Members with Board Validator | 10 minutes |
| **Document updated** | A document is edited by a non-validator | Members with Board Validator | 10 minutes |
| **Document deletion** | A document is removed from the board | Members with Board Validator | Instant (cancels pending "new document" or "updated" notifications) |
| **Document expiring soon** | Board documents are approaching their visibility end date | Members with Board Validator | Instant |
| **Open data sync completed** | The open-data import finishes | The member who triggered the sync | Instant |

All types respect user notification preferences and can be individually toggled off.

## How Debouncing Works

Some notification types have a debounce window. When a triggering event occurs, the notification is not sent immediately — it is held for the configured delay. If multiple similar events happen within that window (e.g., several documents uploaded in quick succession), they are grouped into a single digest email instead of flooding the recipient's inbox.

For example, if three documents are uploaded within 10 minutes, the board validator receives one email listing all three — not three separate emails.

## Cancellation

Some actions cancel pending notifications. When a document is deleted shortly after being uploaded, the pending "new document" notification is cancelled rather than sending a confusing email about a document that no longer exists.

## Notification Preferences

Users can manage their notification preferences at **Profile > Notification preferences**. Each notification type can be individually enabled or disabled. Preferences can also be set by category (e.g., disabling all board-related notifications at once).

Users with a notification type disabled are skipped — no email is sent.

## Email Delivery

Notifications are delivered by email. Emails are rendered in the congregation's language and sent from the congregation's configured sender address. Self-hosters configure the email provider during setup; managed-hosting users do not need to configure anything.

## Self-hosting requirements

Debounced notifications need a recurring task to be set up on the server, otherwise emails would never be sent. Self-hosters: see [Cron Jobs](../self-hosting/cron-jobs.md) for the schedule and [Environment Variables](../self-hosting/environment-variables.md) for the email-provider configuration.

## Related

- [Display Board](display-board.md) — Board-related notifications
- [Cron Jobs](../self-hosting/cron-jobs.md) — Required cron setup for notification delivery
- [Notification System Architecture](../development/notifications.md) — Technical details for contributors
