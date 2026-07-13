import type { NotificationTypeDefinition } from './notification-definition'
import { isCancellationType } from './notification-event.type'

// Pure validators for the notifications registry. Called by
// `notifications/server/registry.server.ts` at module load — a failure trips
// a startup error so contributors see the problem in CI on first import,
// not on the first `notify()` call in production.

// Detects a type string declared by more than one manifest (or twice inside
// one manifest). The error names every duplicate type together with each
// manifest that contributed it, so a contributor can grep-and-fix in one pass.
//
// Callers pass a labelled record — the object keys become the manifest names
// in the error message, so `{ boardNotifications, territoryNotifications }`
// yields "declared by boardNotifications and territoryNotifications".
export function assertNoDuplicateTypes(sources: Record<string, NotificationTypeDefinition<unknown>[]>): void {
  const owners = new Map<string, string[]>()
  for (const [source, defs] of Object.entries(sources)) {
    for (const def of defs) {
      const existing = owners.get(def.type)
      if (existing) {
        existing.push(source)
      } else {
        owners.set(def.type, [source])
      }
    }
  }

  const duplicates = [...owners.entries()].filter(([, sourcesFor]) => sourcesFor.length > 1)
  if (duplicates.length === 0) return

  const lines = duplicates.map(([type, sourcesFor]) => `  - '${type}' declared by ${sourcesFor.join(' and ')}`)
  throw new Error(`Duplicate notification type registration:\n${lines.join('\n')}`)
}

// Detects a `cancels: string[]` entry that references a notification type
// no one has registered. Catches the "renamed a type, forgot to update the
// deletion type's cancels list" mistake at load time.
export function assertCancelsReferenceExistingTypes(
  registry: ReadonlyMap<string, NotificationTypeDefinition<unknown>>,
): void {
  const dangling: string[] = []
  for (const def of registry.values()) {
    if (!isCancellationType(def.routing)) continue
    for (const cancelled of def.routing.cancels) {
      if (!registry.has(cancelled)) {
        dangling.push(`  - '${def.type}'.cancels references unregistered type '${cancelled}'`)
      }
    }
  }
  if (dangling.length === 0) return
  throw new Error(`Notification registry has dangling cancels references:\n${dangling.join('\n')}`)
}
