# Notifications

Unitae sends email notifications to keep congregation members informed about events that concern them. Notifications are delivered asynchronously and can be configured per user.

## Notification Types

| Type | Trigger | Recipients | Debounce |
|------|---------|-----------|----------|
| **New document on board** | A document is uploaded to the display board | Users with the `BoardValidator` role | 10 minutes |
| **Document deletion** | A document is removed from the board | Users with the `BoardValidator` role | Instant (cancels pending "new document" notifications) |
| **Documents expiring** | Board documents are approaching their visibility end date | Users with the `BoardValidator` role | Instant |
| **Territory sync completed** | The open data (BANO) import finishes | The user who triggered the sync | Instant |

## How Debouncing Works

Some notification types have a debounce window. When a triggering event occurs, the notification is not sent immediately — it is held for the configured delay. If multiple similar events happen within that window (e.g., several documents uploaded in quick succession), they are grouped into a single digest email instead of flooding the recipient's inbox.

For example, if three documents are uploaded within 10 minutes, the board validator receives one email listing all three — not three separate emails.

## Cancellation

Some actions cancel pending notifications. When a document is deleted shortly after being uploaded, the pending "new document" notification is cancelled rather than sending a confusing email about a document that no longer exists.

## Notification Preferences

Users can manage their notification preferences at **Profile > Notification preferences**. Each notification type can be individually enabled or disabled. Preferences can also be set by category (e.g., disabling all board-related notifications at once).

Disabled notifications are never sent — they are filtered out during recipient resolution.

## Email Delivery

Notifications are delivered by email via the Resend API. Emails are rendered in the congregation's language and sent from the congregation's configured sender address.

Email delivery requires the `RESEND_API_KEY` environment variable to be set. Without it, the application works normally but no notification emails are sent.

## Cron Requirement

Debounced notifications require the `/cron/process-notifications` endpoint to be called on a regular schedule (every 5–10 minutes). Without this, debounced notifications will accumulate in the database but never be delivered.

See [Cron Jobs](../self-hosting/cron-jobs.md) for setup instructions.

## Related

- [Display Board](display-board.md) — Board-related notifications
- [Cron Jobs](../self-hosting/cron-jobs.md) — Required cron setup for notification delivery
- [Notification System Architecture](../development/notifications.md) — Technical details for contributors
