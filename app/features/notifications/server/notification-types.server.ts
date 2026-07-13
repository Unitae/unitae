import type { NotificationTypeConfig } from '../model/notification-event.type'

// All notification types — notify() reads this to decide the routing path.
// debounceMinutes > 0 → PostgreSQL buffer, debounceMinutes === 0 → straight to BullMQ.
// Types with `cancels` cancel pending events; if nothing to cancel, send `fallback`.
export const NOTIFICATION_TYPES: Record<string, NotificationTypeConfig> = {
  // Board document — migrated from existing direct emailQueue.add()
  'board.document.created': {
    debounceMinutes: 10,
    recipientStrategy: 'role',
    recipientRole: 'board-validator',
  },
  'board.document.updated': {
    debounceMinutes: 10,
    recipientStrategy: 'role',
    recipientRole: 'board-validator',
  },
  'board.document.deleted': {
    cancels: ['board.document.created', 'board.document.updated'],
    fallback: {
      debounceMinutes: 0,
      recipientStrategy: 'role',
      recipientRole: 'board-validator',
    },
  },
  'board.document.expiring': {
    debounceMinutes: 0,
    recipientStrategy: 'role',
    recipientRole: 'board-validator',
  },

  'territory.sync.completed': {
    debounceMinutes: 0,
    recipientStrategy: 'entity-user',
  },
}
