import { z } from 'zod'
import { defineNotificationType, manifest } from '~/features/notifications'
import * as m from '~/i18n/paraglide/messages'
import { Permission } from '~/shared/types/permission'
import BuildingSyncDone from '../emails/buildings-sync-done'
import BuildingSyncFailed from '../emails/buildings-sync-failed'

// Both are sent to whoever started the sync (`recipientId` at notify() time), which takes CanManageBuildings.
const category = {
  key: 'territory',
  label: () => m.notification_category_territory(),
  hint: () => m.notification_category_territory_hint(),
}
const audience = { permission: Permission.CanManageBuildings }

const territorySyncCompleted = defineNotificationType({
  type: 'territory.sync.completed',
  category,
  label: () => m.notification_territory_sync_completed(),
  audience,
  routing: {
    debounceMinutes: 0,
    recipientStrategy: 'entity-user',
  },
  // Optional: events queued before runs were recorded carry no counts.
  payload: z.object({ created: z.number().int().optional(), missing: z.number().int().optional() }),
  subject: () => m.email_territory_sync_subject(),
  renderEmail: ({ recipient, congregation, payload }) => (
    <BuildingSyncDone
      email={recipient.email}
      firstname={recipient.firstname ?? undefined}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
      created={payload.created}
      missing={payload.missing}
    />
  ),
  example: { created: 12, missing: 4 },
})

const territorySyncFailed = defineNotificationType({
  type: 'territory.sync.failed',
  category,
  label: () => m.notification_territory_sync_failed(),
  audience,
  routing: {
    debounceMinutes: 0,
    recipientStrategy: 'entity-user',
  },
  // A BuildingSyncError code, worded in the recipient's language at render time.
  payload: z.object({ reason: z.string().optional() }),
  subject: () => m.email_territory_sync_failed_subject(),
  renderEmail: ({ recipient, congregation, payload }) => (
    <BuildingSyncFailed
      email={recipient.email}
      firstname={recipient.firstname ?? undefined}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
      reason={payload.reason}
    />
  ),
  example: { reason: 'SourceRefused' },
})

// `manifest()` erases the payload generic so downstream code can iterate
// without narrowing to a union. See defineNotificationType docs.
export const territoryNotifications = manifest(territorySyncCompleted, territorySyncFailed)
