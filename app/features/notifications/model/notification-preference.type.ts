export type NotificationCategory = {
  key: string
  labelKey: string
  types: NotificationTypeInfo[]
}

export type NotificationTypeInfo = {
  type: string
  labelKey: string
  critical?: boolean
}

// Notification categories for the preferences UI
// Types with critical: true cannot be disabled by users
export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  {
    key: 'board',
    labelKey: 'notification_category_board',
    types: [
      { type: 'board.document.created', labelKey: 'notification_board_document_created' },
      { type: 'board.document.updated', labelKey: 'notification_board_document_updated' },
      { type: 'board.document.deleted', labelKey: 'notification_board_document_deleted' },
      { type: 'board.document.expiring', labelKey: 'notification_board_document_expiring' },
    ],
  },
  {
    key: 'territory',
    labelKey: 'notification_category_territory',
    types: [{ type: 'territory.sync.completed', labelKey: 'notification_territory_sync_completed' }],
  },
]
