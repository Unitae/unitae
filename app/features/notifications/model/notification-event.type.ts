export type NotificationStatus = 'pending' | 'cancelled' | 'sent' | 'failed'

export type RecipientStrategy = 'role' | 'entity-publisher' | 'entity-assignee' | 'entity-user'

export type DebouncedNotificationType = {
  debounceMinutes: number
  recipientStrategy: RecipientStrategy
  recipientRole?: string
}

export type CancellationNotificationType = {
  cancels: string[]
  fallback: DebouncedNotificationType
}

export type NotificationTypeConfig = DebouncedNotificationType | CancellationNotificationType

export function isCancellationType(config: NotificationTypeConfig): config is CancellationNotificationType {
  return 'cancels' in config
}
