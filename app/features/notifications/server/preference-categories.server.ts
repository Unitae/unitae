import type { NotificationCategoryView } from '../model/notification-preference.type'
import { NOTIFICATION_REGISTRY } from './registry.server'

// Groups every registered definition by its category key and resolves the
// Paraglide accessors into strings. Called from the preferences route loader;
// the resulting shape is client-safe (plain strings, no functions).
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
