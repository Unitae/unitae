import { boardNotifications } from '~/features/display-board/index.server'
import { territoryNotifications } from '~/features/territories/index.server'
import type { NotificationTypeDefinition } from '../model/notification-definition'

// Central registry of feature-owned notification definitions.
//
// Adding a new type: the owning feature exports its definitions from its
// index.server.ts barrel; add one import line here and one spread into
// `definitions`. That's the whole cross-feature edit.
//
// The pipeline (notification-types, render-notification-email, preferences UI)
// derives everything from this map — nothing else is hand-maintained.

const definitions: NotificationTypeDefinition<unknown>[] = [...boardNotifications, ...territoryNotifications]

export const NOTIFICATION_REGISTRY: ReadonlyMap<string, NotificationTypeDefinition<unknown>> = new Map(
  definitions.map(def => [def.type, def as NotificationTypeDefinition<unknown>]),
)

// Duplicate-type check — trip a startup error if two features declare the same
// type string. Cheaper than debugging a silent overwrite.
if (definitions.length !== NOTIFICATION_REGISTRY.size) {
  const seen = new Set<string>()
  const dupes: string[] = []
  for (const def of definitions) {
    if (seen.has(def.type)) dupes.push(def.type)
    seen.add(def.type)
  }
  throw new Error(`Duplicate notification type registration: ${[...new Set(dupes)].join(', ')}`)
}
