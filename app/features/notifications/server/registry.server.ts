import { boardNotifications } from '~/features/display-board/index.server'
import { eventsNotifications } from '~/features/events/index.server'
import { territoryNotifications } from '~/features/territories/index.server'
import type { NotificationTypeDefinition } from '../model/notification-definition'
import { assertCancelsReferenceExistingTypes, assertNoDuplicateTypes } from '../model/registry-guards'

// Central registry of feature-owned notification definitions.
//
// Adding a new type: the owning feature exports its definitions from its
// index.server.ts barrel; add one import line here and one entry into
// `manifests`. That's the whole cross-feature edit.
//
// The pipeline (notification-types, render-notification-email, preferences UI)
// derives everything from this map — nothing else is hand-maintained.
//
// Both integrity checks fire at module load, not at first `notify()` call —
// contributors see the failure on CI import rather than debugging silent
// misroutes in production.

const manifests = {
  boardNotifications,
  eventsNotifications,
  territoryNotifications,
}

assertNoDuplicateTypes(manifests)

const definitions: NotificationTypeDefinition<unknown>[] = Object.values(manifests).flat()

export const NOTIFICATION_REGISTRY: ReadonlyMap<string, NotificationTypeDefinition<unknown>> = new Map(
  definitions.map(def => [def.type, def as NotificationTypeDefinition<unknown>]),
)

assertCancelsReferenceExistingTypes(NOTIFICATION_REGISTRY)
