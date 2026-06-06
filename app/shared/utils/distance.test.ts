import { describe, expect, it } from 'vitest'
import { formatDistance, haversineMeters } from './distance'

const oneEightyMeters = /^180\s?m$/
const nineNineNineMeters = /^999\s?m$/
const oneEightyOneMeters = /^181\s?m$/
const twelvePointTwoKm = /^1[.,]2\s?km$/
const twelvePointEightKm = /^12[.,]8\s?km$/

describe('haversineMeters', () => {
  it('returns 0 for the same point', () => {
    const point = { lat: 48.8566, lng: 2.3522 }
    expect(haversineMeters(point, point)).toBeCloseTo(0, 0)
  })

  it('measures the Paris→Lyon distance within a few percent', () => {
    const paris = { lat: 48.8566, lng: 2.3522 }
    const lyon = { lat: 45.764, lng: 4.8357 }
    // Reference straight-line distance: ~391 km
    const meters = haversineMeters(paris, lyon)
    expect(meters).toBeGreaterThan(388_000)
    expect(meters).toBeLessThan(394_000)
  })

  it('is symmetric', () => {
    const a = { lat: 48.85, lng: 2.35 }
    const b = { lat: 48.87, lng: 2.33 }
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6)
  })
})

describe('formatDistance', () => {
  it('formats under 1km as meters with no decimals', () => {
    expect(formatDistance(180)).toMatch(oneEightyMeters)
    expect(formatDistance(999)).toMatch(nineNineNineMeters)
  })

  it('rounds to the nearest meter', () => {
    expect(formatDistance(180.6)).toMatch(oneEightyOneMeters)
  })

  it('formats 1km+ as kilometers with one decimal', () => {
    // French locale uses a comma; assert on the structure rather than literal char
    expect(formatDistance(1200)).toMatch(twelvePointTwoKm)
    expect(formatDistance(12_800)).toMatch(twelvePointEightKm)
  })

  it('returns empty string for invalid input', () => {
    expect(formatDistance(Number.NaN)).toBe('')
    expect(formatDistance(-5)).toBe('')
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe('')
  })
})
