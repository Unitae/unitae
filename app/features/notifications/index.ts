// Public client-safe surface of the notifications feature.
//
// Email templates live in the feature that owns the domain event (see
// docs/development/notifications.md), so they are not re-exported here.

export {
  defineNotificationType,
  type NotificationRecipient,
  type NotificationRenderContext,
  type NotificationTypeDefinition,
} from './model/notification-definition'
