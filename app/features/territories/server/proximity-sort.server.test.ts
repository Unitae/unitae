import { describe, expect, it } from 'vitest'
import { closestTerritoryPoint, paginateByProximity } from './proximity-sort.server'

const origin = { lat: 48.8566, lng: 2.3522 }

describe('paginateByProximity', () => {
  it('orders items by distance ascending', () => {
    const items = [
      { id: 1, coords: { lat: 48.87, lng: 2.36 } },
      { id: 2, coords: { lat: 48.86, lng: 2.35 } },
      { id: 3, coords: { lat: 48.9, lng: 2.4 } },
    ]
    const url = new URL('https://example.com/?page=1&pageSize=10')
    const result = paginateByProximity(items, origin, i => i.coords, url)
    expect(result.items.map(i => i.id)).toEqual([2, 1, 3])
  })

  it('pushes items without coords to the tail and preserves order', () => {
    const items = [
      { id: 1, coords: null },
      { id: 2, coords: { lat: 48.87, lng: 2.36 } },
      { id: 3, coords: null },
      { id: 4, coords: { lat: 48.86, lng: 2.35 } },
    ]
    const url = new URL('https://example.com/?page=1&pageSize=10')
    const result = paginateByProximity(items, origin, i => i.coords, url)
    expect(result.items.map(i => i.id)).toEqual([4, 2, 1, 3])
    expect(result.withCoordsCount).toBe(2)
    expect(result.withoutCoordsCount).toBe(2)
  })

  it('paginates the combined list — page 2 of pageSize 2', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, coords: { lat: 48 + i * 0.01, lng: 2 } }))
    const url = new URL('https://example.com/?page=2&pageSize=2')
    const result = paginateByProximity(items, origin, i => i.coords, url)
    expect(result.items).toHaveLength(2)
    expect(result.pagination.page).toBe(2)
    expect(result.pagination.pages).toBe(3)
  })

  it('exposes distances per item — null for missing coords', () => {
    const a = { id: 1, coords: { lat: 48.87, lng: 2.36 } }
    const b = { id: 2, coords: null }
    const url = new URL('https://example.com/?page=1&pageSize=10')
    const result = paginateByProximity([a, b], origin, i => i.coords, url)
    const distA = result.distances.get(a)
    expect(distA).not.toBeNull()
    expect(distA).toBeGreaterThan(0)
    expect(result.distances.get(b)).toBeNull()
  })
})

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
        buildings: [{ latitude: 48.86, lng: 2.36 } as never, { latitude: 48.857, longitude: 2.353 }],
      },
    ])
    expect(point).toEqual({ lat: 48.857, lng: 2.353 })
  })
})
