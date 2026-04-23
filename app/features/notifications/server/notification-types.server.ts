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
  'board.document.deleted': {
    cancels: ['board.document.created', 'board.document.updated'],
    fallback: {
      debounceMinutes: 0,
      recipientStrategy: 'role',
      recipientRole: 'board-validator',
    },
  },

  // Future types added here by follow-up PRs:
  // 'attribution.created': { debounceMinutes: 15, recipientStrategy: 'entity-publisher' },
  // 'attribution.deleted': { cancels: [...], fallback: { ... } },
  // 'user.password.changed': { debounceMinutes: 0, recipientStrategy: 'entity-user' },
}
