import { beforeEach, describe, expect, it, vi } from 'vitest'

// A map tile, served by the instance itself: only to a signed-in account (the layout's middleware), only inside its
// congregation's area, and kept for good by the browser since the address names the archive's edition.

const currentAccountContext = Symbol('currentAccountContext')
vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown, congregationId: number) => unknown) => fn({}, 10),
}))

let area: { area: { swLat: number; swLng: number; neLat: number; neLng: number }; perimeter: null } | null
vi.mock('~/features/territories/server/map-area.queries', () => ({ getMapArea: async () => area }))

const asked: string[] = []
let store: {
  edition: () => Promise<string>
  maxZoom: () => Promise<number>
  tile: (z: number, x: number, y: number) => Promise<{ data: Uint8Array; encoding: 'gzip' | null } | null>
} | null
vi.mock('~/shared/infra/map-tiles.server', () => ({ getMapTiles: () => store }))
vi.mock('~/shared/infra/logger.server', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const { loader } = await import('./tile')

let congregationId = 10
const context = { get: () => ({ id: 1, congregationId }) }
const LES_LILAS = { swLat: 48.872, swLng: 2.405, neLat: 48.888, neLng: 2.43 }

const request = (z: string, x: string, y: string, edition = 'ed1') =>
  loader({
    params: { edition, z, x, y },
    request: new Request(`http://localhost/map/tiles/${edition}/${z}/${x}/${y}`),
    context,
  } as never) as Promise<Response>

beforeEach(() => {
  asked.length = 0
  congregationId += 1 // a fresh congregation for each case: the area cache never carries over
  area = { area: LES_LILAS, perimeter: null }
  store = {
    edition: async () => 'ed1',
    maxZoom: async () => 15,
    tile: async (z, x, y) => {
      asked.push(`${z}/${x}/${y}`)
      return { data: new Uint8Array([31, 139, 8]), encoding: 'gzip' }
    },
  }
})

describe('a map tile', () => {
  it('is served gzipped, kept for good, inside the congregation’s area', async () => {
    const response = await request('15', '16604', '11269')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/vnd.mapbox-vector-tile')
    expect(response.headers.get('Content-Encoding')).toBe('gzip')
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([31, 139, 8]))
  })

  it('is empty outside the area, without reading the archive', async () => {
    const response = await request('15', '1', '1')
    expect(response.status).toBe(204)
    expect(asked).toEqual([])
  })

  it('is empty while the congregation has no area yet', async () => {
    area = null
    expect((await request('15', '16604', '11269')).status).toBe(204)
    expect(asked).toEqual([])
  })

  it('is empty where the archive holds nothing', async () => {
    store = { ...(store as NonNullable<typeof store>), tile: async () => null }
    expect((await request('15', '16604', '11269')).status).toBe(204)
  })

  it('does not exist on an instance without a map', async () => {
    store = null
    expect((await request('15', '16604', '11269')).status).toBe(404)
  })

  it('does not exist for another edition of the archive: the page asks for the current one', async () => {
    expect((await request('15', '16604', '11269', 'old')).status).toBe(404)
    expect(asked).toEqual([])
  })

  it('is empty past the deepest zoom the archive holds, without reading it', async () => {
    const response = await request('16', '33208', '22538')
    expect(response.status).toBe(204)
    expect(asked).toEqual([])
  })

  it('refuses coordinates that are not a tile', async () => {
    expect((await request('31', '0', '0')).status).toBe(400)
    expect((await request('2', '4', '0')).status).toBe(400)
    expect((await request('15', '-1', '3')).status).toBe(400)
    expect((await request('15', '1.5', '3')).status).toBe(400)
    expect(asked).toEqual([])
  })

  it('says the base map is unavailable when the archive cannot be read', async () => {
    store = {
      ...(store as NonNullable<typeof store>),
      tile: async () => {
        throw new Error('bucket unreachable')
      },
    }
    expect((await request('15', '16604', '11269')).status).toBe(503)
  })
})
