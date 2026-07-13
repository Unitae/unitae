import { describe, expect, it } from 'vitest'
import { NOTIFICATION_REGISTRY } from './registry.server'

// Registry integrity tests. Duplicate-detection and cancels-referential-integrity
// behaviors are tested against pure functions in
// `app/features/notifications/model/registry-guards.test.ts` — this file
// only asserts the assembled registry the pipeline actually consumes.

describe('NOTIFICATION_REGISTRY', () => {
  it('registers at least the five known notification types', () => {
    // Floor check — catches an accidentally empty spread in registry.server.ts
    // (e.g. a barrel that stopped re-exporting). Contract test covers each type
    // individually.
    expect(NOTIFICATION_REGISTRY.size).toBeGreaterThanOrEqual(5)
  })

  it('exposes each definition keyed by its own type string', () => {
    for (const [key, def] of NOTIFICATION_REGISTRY) {
      expect(key).toBe(def.type)
    }
  })

  it('includes every notification type declared in the pre-refactor NOTIFICATION_TYPES map', () => {
    // Regression guard — if a manifest silently drops a type, the pipeline
    // would render null for it forever. Enumerate the known types to catch
    // that.
    const knownTypes = [
      'board.document.created',
      'board.document.updated',
      'board.document.deleted',
      'board.document.expiring',
      'territory.sync.completed',
    ]
    for (const type of knownTypes) {
      expect(NOTIFICATION_REGISTRY.has(type), `${type} missing from NOTIFICATION_REGISTRY`).toBe(true)
    }
  })
})
