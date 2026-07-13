import type { NotificationCategoryView } from '../model/notification-preference.type'
import { NOTIFICATION_REGISTRY } from './registry.server'

// Groups every registered definition by its category key and resolves the
// Paraglide label accessors into plain strings.
//
// Resolution happens server-side (not in the client component) because
// `NOTIFICATION_REGISTRY` is a server-only module and label accessors would
// otherwise need to cross the loader boundary as functions — which React
// Router loader data can't serialize. Handing plain strings to the client
// keeps the loader payload JSON-safe and locale-resolved via `runInWorkerContext`.
//
// If two definitions share a `category.key`, the first-seen definition's
// `category.label` accessor wins. Since consumer features share a single
// `CATEGORY = { key, label }` const across all their definitions, this is
// stable in practice — but a future PR could add a collision check here.
export function derivePreferenceCategories(): NotificationCategoryView[] {
  const byCategory = new Map<string, NotificationCategoryView>()

  for (const def of NOTIFICATION_REGISTRY.values()) {
    const key = def.category.key
    let view = byCategory.get(key)
    if (!view) {
      view = { key, label: def.category.label(), types: [] }
      byCategory.set(key, view)
    }
    view.types.push({ type: def.type, label: def.label(), critical: def.critical })
  }

  return [...byCategory.values()]
}
