import type { NotificationTypeConfig } from '../model/notification-event.type'
import { NOTIFICATION_REGISTRY } from './registry.server'

// Derived from the registry. Each definition's `routing` field is the same
// shape callers used to write into a hand-maintained map — the pipeline reads
// this to decide debounce/cancellation behavior.
export const NOTIFICATION_TYPES: Record<string, NotificationTypeConfig> = Object.fromEntries(
  [...NOTIFICATION_REGISTRY].map(([type, def]) => [type, def.routing]),
)
