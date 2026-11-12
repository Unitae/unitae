import { describe, expect, it } from 'vitest'
import { clusterIndex } from './editor-clusters'

// The editor groups entrances too close to tell apart while zoomed out, and shows each one alone from the street
// level on, as the map's Google clusterer did (one zoom level lower: MapLibre's tiles are 512 pixels, not 256).

const WORLD: [number, number, number, number] = [-180, -85, 180, 85]

/** Entrances a few metres apart, around a street corner in Lyon. */
const street = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  latitude: 45.75 + index * 0.00005,
  longitude: 4.83 + index * 0.00005,
}))

describe('the editor map clusters', () => {
  it('groups close entrances while zoomed out, with their count', () => {
    const items = clusterIndex(street).itemsIn(WORLD, 12)
    expect(items).toEqual([expect.objectContaining({ kind: 'cluster', count: 12 })])
  })

  it('shows each entrance alone from zoom 15 on', () => {
    const items = clusterIndex(street).itemsIn(WORLD, 15)
    expect(items).toHaveLength(12)
    expect(items.every(item => item.kind === 'entrance')).toBe(true)
  })

  it('hands back the entrance itself, with its position', () => {
    const [item] = clusterIndex([street[0]]).itemsIn(WORLD, 10)
    expect(item).toEqual({ kind: 'entrance', entrance: street[0], lat: 45.75, lng: 4.83 })
  })

  it('leaves out what lies outside the view', () => {
    const far = { id: 99, latitude: 48.85, longitude: 2.35 }
    const items = clusterIndex([...street, far]).itemsIn([4.8, 45.7, 4.9, 45.8], 16)
    expect(items.map(item => (item.kind === 'entrance' ? item.entrance.id : null))).not.toContain(99)
    expect(items).toHaveLength(12)
  })

  it('leaves out entrances without a position', () => {
    const items = clusterIndex([...street, { id: 50, latitude: null, longitude: null }]).itemsIn(WORLD, 16)
    expect(items).toHaveLength(12)
  })

  it('opens a group at a zoom where it splits', () => {
    const index = clusterIndex(street)
    const [cluster] = index.itemsIn(WORLD, 12)
    if (cluster.kind !== 'cluster') throw new Error('expected a cluster')
    const zoom = index.expansionZoom(cluster.id)
    expect(zoom).toBeGreaterThan(12)
    expect(index.itemsIn(WORLD, zoom).length).toBeGreaterThan(1)
  })
})
