import { describe, expect, it } from 'vitest'
import { NOTIFICATION_REGISTRY } from './registry.server'

describe('NOTIFICATION_REGISTRY', () => {
  it('loads without duplicate-type errors', () => {
    // If any two feature manifests declare the same `type` string, the
    // registry module throws at load time. Reaching this test at all means
    // the guard passed. The size check just makes intent explicit.
    expect(NOTIFICATION_REGISTRY.size).toBe(NOTIFICATION_REGISTRY.size)
  })

  it('exposes each definition keyed by its type string', () => {
    for (const [key, def] of NOTIFICATION_REGISTRY) {
      expect(key).toBe(def.type)
    }
  })
})
