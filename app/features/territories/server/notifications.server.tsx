import { z } from 'zod'
import { defineNotificationType, manifest } from '~/features/notifications'
import * as m from '~/i18n/paraglide/messages'
import BuildingSyncDone from '../emails/buildings-sync-done'

// Sync completion is triggered by the requesting user. No dynamic payload
// content is needed — the email addresses them directly. Payload schema is
// empty; recipient targeting comes from `recipientId` at notify() time.
const territorySyncCompleted = defineNotificationType({
  type: 'territory.sync.completed',
  category: { key: 'territory', label: () => m.notification_category_territory() },
  label: () => m.notification_territory_sync_completed(),
  routing: {
    debounceMinutes: 0,
    recipientStrategy: 'entity-user',
  },
  payload: z.object({}),
  subject: () => m.email_territory_sync_subject(),
  renderEmail: ({ recipient, congregation }) => (
    <BuildingSyncDone
      email={recipient.email}
      firstname={recipient.firstname ?? undefined}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />
  ),
  example: {},
})

// `manifest()` erases the payload generic so downstream code can iterate
// without narrowing to a union. See defineNotificationType docs.
export const territoryNotifications = manifest(territorySyncCompleted)
