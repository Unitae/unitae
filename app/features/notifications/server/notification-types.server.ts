import type { NotificationTypeConfig } from '../model/notification-event.type'
import { NOTIFICATION_REGISTRY } from './registry.server'

// Routing config indexed by notification type. Consumed by `notify.server.ts`
// to decide debounce vs. cancellation vs. instant paths. Derived from the
// registry so definitions declare routing once at their source.
//
// Kept as a separate module (rather than inlined into `notify.server.ts`) so
// `notify()`'s import graph does not pull React Email templates through the
// registry — templates only load in the worker path via
// `render-notification-email.server.tsx`.
export const NOTIFICATION_TYPES: Record<string, NotificationTypeConfig> = Object.fromEntries(
  [...NOTIFICATION_REGISTRY].map(([type, def]) => [type, def.routing]),
)
