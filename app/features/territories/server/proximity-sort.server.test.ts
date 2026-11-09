import { describe, expect, it } from 'vitest'
import { closestTerritoryPoint } from './proximity-sort.server'

const origin = { lat: 48.8566, lng: 2.3522 }

describe('closestTerritoryPoint', () => {
  it('returns null when no entrance and no building has coords', () => {
    const point = closestTerritoryPoint(origin, [
      { latitude: null, longitude: null, buildings: [{ latitude: null, longitude: null }] },
    ])
    expect(point).toBeNull()
  })

  it('prefers the closest entrance centroid', () => {
    const point = closestTerritoryPoint(origin, [
      {
        latitude: 49.0,
        longitude: 3.0,
        buildings: [],
      },
      {
        latitude: 48.857,
        longitude: 2.353,
        buildings: [],
      },
    ])
    expect(point).toEqual({ lat: 48.857, lng: 2.353 })
  })

  it('falls back to building coordinates when entrance has no centroid', () => {
    const point = closestTerritoryPoint(origin, [
      {
        latitude: null,
        longitude: null,
        buildings: [
          // Two valid buildings — the one farther from origin (48.95)
          // should lose to the closer one (48.857).
          { latitude: 48.95, longitude: 2.5 },
          { latitude: 48.857, longitude: 2.353 },
        ],
      },
    ])
    expect(point).toEqual({ lat: 48.857, lng: 2.353 })
  })

  it('rejects NaN coordinates as if they were null', () => {
    const point = closestTerritoryPoint(origin, [
      {
        latitude: Number.NaN,
        longitude: Number.NaN,
        buildings: [{ latitude: 48.857, longitude: 2.353 }],
      },
    ])
    expect(point).toEqual({ lat: 48.857, lng: 2.353 })
  })

  it('rejects Infinity coordinates', () => {
    const point = closestTerritoryPoint(origin, [
      {
        latitude: Number.POSITIVE_INFINITY,
        longitude: 2.353,
        buildings: [],
      },
    ])
    expect(point).toBeNull()
  })
})
