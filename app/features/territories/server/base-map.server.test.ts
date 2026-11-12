import { beforeEach, describe, expect, it, vi } from 'vitest'

// What a page needs to draw a territory's map: the tile address, with the archive's edition in it, and the
// congregation's area the map stays within. Asking for it also warms the area's tiles.

let store: { edition: () => Promise<string>; maxZoom: () => Promise<number>; tile: () => Promise<null> } | null
const warmed: unknown[] = []
vi.mock('~/shared/infra/map-tiles.server', () => ({ getMapTiles: () => store }))
vi.mock('~/shared/infra/logger.server', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

let mapArea: unknown
vi.mock('./map-area.queries', () => ({ getMapArea: async () => mapArea }))
vi.mock('./map-tiles-area.server', () => ({
  warmMapArea: async (_store: unknown, area: unknown) => {
    warmed.push(area)
    return 0
  },
}))

const { getBaseMap } = await import('./base-map.server')

const AREA = { swLat: 48.872, swLng: 2.405, neLat: 48.888, neLng: 2.43 }
let congregation = 100

beforeEach(() => {
  warmed.length = 0
  congregation += 1
  store = { edition: async () => 'a1b2c3d4e5', maxZoom: async () => 15, tile: async () => null }
  mapArea = { area: AREA, perimeter: null }
})

describe('getBaseMap', () => {
  it('gives the tile address of the current edition and the area, and warms the area', async () => {
    expect(await getBaseMap({} as never, congregation)).toEqual({
      tiles: '/map/tiles/a1b2c3d4e5/{z}/{x}/{y}',
      area: AREA,
    })
    expect(warmed).toEqual([AREA])
  })

  it('has no map on an instance without tiles', async () => {
    store = null
    expect(await getBaseMap({} as never, congregation)).toBeNull()
  })

  it('has no map while the congregation has no area', async () => {
    mapArea = null
    expect(await getBaseMap({} as never, congregation)).toBeNull()
  })

  it('leaves the map out rather than fail the page when the archive cannot be read', async () => {
    store = {
      ...(store as NonNullable<typeof store>),
      edition: async () => {
        throw new Error('bucket unreachable')
      },
    }
    expect(await getBaseMap({} as never, congregation)).toBeNull()
  })

  it('warms a congregation’s area once per edition of the archive', async () => {
    await getBaseMap({} as never, congregation)
    await getBaseMap({} as never, congregation)
    expect(warmed).toEqual([AREA])
    store = { ...(store as NonNullable<typeof store>), edition: async () => 'f6e5d4c3b2' }
    await getBaseMap({} as never, congregation)
    expect(warmed).toEqual([AREA, AREA])
  })
})
