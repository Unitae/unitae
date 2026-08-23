import { describe, expect, it } from 'vitest'
import { checkAvailabilityStatus } from './TerritoryAvaibilityStatus'

const base = {
  endDate: null,
  pausedAt: null,
  campaignId: null,
  type: 'Default',
} as never

describe('checkAvailabilityStatus', () => {
  it('a territory with no attribution is available', () => {
    expect(checkAvailabilityStatus(undefined)).toBe(true)
  })

  it('an open, unpaused attribution makes the territory unavailable', () => {
    expect(checkAvailabilityStatus({ ...(base as object), endDate: null } as never)).toBe(false)
  })

  it('a paused attribution frees the territory for campaign assignment', () => {
    expect(checkAvailabilityStatus({ ...(base as object), pausedAt: new Date() } as never)).toBe(true)
  })

  it('a freshly returned attribution keeps the territory resting', () => {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000)
    expect(checkAvailabilityStatus({ ...(base as object), endDate: yesterday } as never)).toBe(false)
  })
})
