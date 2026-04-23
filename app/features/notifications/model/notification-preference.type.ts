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
      { type: 'board.document.deleted', labelKey: 'notification_board_document_deleted' },
    ],
  },
  // Future categories added here by follow-up PRs:
  // { key: 'territories', labelKey: 'notification_category_territories', types: [...] },
  // { key: 'events', labelKey: 'notification_category_events', types: [...] },
]
