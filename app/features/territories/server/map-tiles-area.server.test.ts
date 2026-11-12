import { describe, expect, it } from 'vitest'
import { createMapAreaCache, warmMapArea } from './map-tiles-area.server'

const AREA = { swLat: 48.872, swLng: 2.405, neLat: 48.888, neLng: 2.43 }

describe('the map area cache', () => {
  it('keeps a congregation’s area for a while, then reads it again', async () => {
    let clock = 0
    let reads = 0
    const cache = createMapAreaCache({ ttlMs: 1000, now: () => clock })
    const load = async () => ({ area: { ...AREA, swLat: ++reads }, perimeter: null })
    expect((await cache.get(10, load))?.area.swLat).toBe(1)
    clock = 999
    expect((await cache.get(10, load))?.area.swLat).toBe(1)
    clock = 1001
    expect((await cache.get(10, load))?.area.swLat).toBe(2)
  })

  it('keeps each congregation apart', async () => {
    const cache = createMapAreaCache()
    await cache.get(10, async () => ({ area: AREA, perimeter: null }))
    expect(await cache.get(11, async () => null)).toBeNull()
    expect((await cache.get(10, async () => null))?.area).toEqual(AREA)
  })
})

describe('warmMapArea', () => {
  function fakeStore(maxZoom = 15) {
    const asked: string[] = []
    return {
      asked,
      maxZoom: async () => maxZoom,
      tile: async (z: number, x: number, y: number) => {
        asked.push(`${z}/${x}/${y}`)
        return null
      },
    }
  }

  it('reads the area’s tiles from the wide zooms down to the deepest the archive holds', async () => {
    const store = fakeStore()
    const read = await warmMapArea(store, AREA)
    expect(read).toBe(store.asked.length)
    expect(store.asked[0]).toBe('10/518/352')
    expect(store.asked).toContain('15/16604/11269')
    expect(store.asked.some(key => key.startsWith('16/'))).toBe(false)
  })

  it('stops at its budget, keeping the wide zooms', async () => {
    const store = fakeStore()
    const read = await warmMapArea(store, AREA, { budget: 3 })
    expect(read).toBe(3)
    expect(store.asked.map(key => key.split('/')[0])).toEqual(['10', '11', '12'])
  })

  it('reads a few tiles at a time, never more', async () => {
    let inFlight = 0
    let most = 0
    const slow = {
      maxZoom: async () => 15,
      tile: async () => {
        inFlight++
        most = Math.max(most, inFlight)
        await new Promise(resolve => setTimeout(resolve, 2))
        inFlight--
        return null
      },
    }
    const read = await warmMapArea(slow, AREA)
    expect(read).toBeGreaterThan(8)
    expect(most).toBe(4)
  })
})
