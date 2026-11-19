import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDemoCongregation, isDemoModeEnabled, nextDemoExpiry } from '~/features/demo/server/demo-mode.server'

const HOUR = 60 * 60 * 1000
const READY = new Date('2026-11-20T10:00:00Z')

afterEach(() => vi.unstubAllEnvs())

describe('demo mode', () => {
  it('is off unless UNITAE_DEMO says true', () => {
    vi.stubEnv('UNITAE_DEMO', '')
    expect(isDemoModeEnabled()).toBe(false)
    vi.stubEnv('UNITAE_DEMO', 'true')
    expect(isDemoModeEnabled()).toBe(true)
  })

  it('treats a congregation as a demo copy only when the mode is on and it has an expiry', () => {
    vi.stubEnv('UNITAE_DEMO', 'true')
    expect(isDemoCongregation({ demoExpiresAt: READY })).toBe(true)
    expect(isDemoCongregation({ demoExpiresAt: null })).toBe(false)
    vi.stubEnv('UNITAE_DEMO', '')
    expect(isDemoCongregation({ demoExpiresAt: READY })).toBe(false)
  })
})

describe('nextDemoExpiry', () => {
  it('pushes the expiry an hour past the visitor’s last request', () => {
    const now = new Date(READY.getTime() + 2 * HOUR)
    const next = nextDemoExpiry({ now, readyAt: READY, expiresAt: new Date(now.getTime() + 10 * 60 * 1000) })
    expect(next).toEqual(new Date(now.getTime() + HOUR))
  })

  it('writes nothing when the last push is under a minute old', () => {
    const now = new Date(READY.getTime() + 2 * HOUR)
    expect(nextDemoExpiry({ now, readyAt: READY, expiresAt: new Date(now.getTime() + HOUR - 30 * 1000) })).toBeNull()
  })

  it('never goes past 24 hours after the copy was ready', () => {
    const now = new Date(READY.getTime() + 23.5 * HOUR)
    const next = nextDemoExpiry({ now, readyAt: READY, expiresAt: new Date(now.getTime() + 5 * 60 * 1000) })
    expect(next).toEqual(new Date(READY.getTime() + 24 * HOUR))
  })

  it('leaves an expired copy alone: the control plane deletes it', () => {
    const now = new Date(READY.getTime() + 3 * HOUR)
    expect(nextDemoExpiry({ now, readyAt: READY, expiresAt: new Date(now.getTime() - 1000) })).toBeNull()
  })
})
