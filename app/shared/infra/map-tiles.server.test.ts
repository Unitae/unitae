import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The map's tiles, read from one PMTiles archive (a file or a URL) and kept in memory. A fake archive stands in for
// the pmtiles reader: each read of a tile returns fresh bytes, so a cached answer shows up as the first bytes.

const env: Record<string, string | undefined> = {}
vi.mock('~/shared/utils/env.server', () => ({ getOptionalEnv: (name: string) => env[name] }))
vi.mock('~/shared/infra/logger.server', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const { createTileStore, FileArchiveSource, getMapTiles } = await import('./map-tiles.server')

const HEADER = {
  tileCompression: 2,
  rootDirectoryOffset: 127,
  rootDirectoryLength: 4000,
  tileDataLength: 1_000_000,
  numTileEntries: 500,
  numAddressedTiles: 520,
  maxZoom: 15,
}

function fakeArchive(header: Partial<typeof HEADER> = {}) {
  let reads = 0
  return {
    getHeader: async () => ({ ...HEADER, ...header }),
    getZxy: async (z: number, x: number, y: number) => {
      if (z > 15) return undefined
      reads++
      return { data: new TextEncoder().encode(`${z}/${x}/${y}#${reads}`).buffer }
    },
  }
}

const EDITION = /^[0-9a-f]{10}$/
const COMPRESSION = /compression/
// The store gzips what the archive reader hands it (the reader decompresses tiles itself).
const text = (tile: { data: Uint8Array } | null) => (tile == null ? null : gunzipSync(tile.data).toString())

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key]
})

describe('the tile store', () => {
  it('names the archive with an edition that changes when the archive does', async () => {
    const first = await createTileStore(fakeArchive()).edition()
    expect(first).toMatch(EDITION)
    expect(await createTileStore(fakeArchive()).edition()).toBe(first)
    expect(await createTileStore(fakeArchive({ tileDataLength: 2_000_000 })).edition()).not.toBe(first)
  })

  it('hands the tile over gzipped, whatever the archive held', async () => {
    const tile = await createTileStore(fakeArchive()).tile(14, 8302, 5636)
    expect(tile?.encoding).toBe('gzip')
    expect(text(tile)).toBe('14/8302/5636#1')
    const plain = await createTileStore(fakeArchive({ tileCompression: 1 })).tile(14, 8302, 5636)
    expect(plain?.encoding).toBe('gzip')
    expect(text(plain)).toBe('14/8302/5636#1')
  })

  it('has nothing for a tile the archive does not hold', async () => {
    expect(await createTileStore(fakeArchive()).tile(16, 1, 1)).toBeNull()
  })

  it('answers a tile it read already from memory', async () => {
    const store = createTileStore(fakeArchive())
    await store.tile(14, 1, 1)
    await store.tile(14, 2, 2)
    expect(text(await store.tile(14, 1, 1))).toBe('14/1/1#1')
  })

  it('reads a tile once when two people ask for it at the same moment', async () => {
    const store = createTileStore(fakeArchive())
    const [a, b] = await Promise.all([store.tile(14, 1, 1), store.tile(14, 1, 1)])
    expect(text(a)).toBe('14/1/1#1')
    expect(text(b)).toBe('14/1/1#1')
  })

  it('lets the least recently used tiles go past its size', async () => {
    // Each fake tile is 28 bytes once gzipped: room for two.
    const store = createTileStore(fakeArchive(), { maxBytes: 70 })
    await store.tile(14, 1, 1)
    await store.tile(14, 2, 2)
    await store.tile(14, 1, 1) // used again: 2/2 is now the oldest
    await store.tile(14, 3, 3)
    expect(text(await store.tile(14, 1, 1))).toBe('14/1/1#1')
    expect(text(await store.tile(14, 2, 2))).toBe('14/2/2#4')
  })

  it('refuses an archive whose tiles a browser cannot read as they are', async () => {
    await expect(createTileStore(fakeArchive({ tileCompression: 4 })).tile(14, 1, 1)).rejects.toThrow(COMPRESSION)
  })
})

describe('getMapTiles', () => {
  it('has no map while the instance names no archive', () => {
    expect(getMapTiles()).toBeNull()
  })

  it('opens the archive the instance names, once', () => {
    env.UNITAE_MAP_TILES = 'https://tiles.example.org/planet.pmtiles'
    const store = getMapTiles()
    expect(store).not.toBeNull()
    expect(getMapTiles()).toBe(store)
  })
})

describe('an archive on the server’s disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'map-tiles-'))
  const path = join(dir, 'area.pmtiles')
  // 300 KB of known bytes: byte i is i % 251, so any range can be checked.
  writeFileSync(
    path,
    Uint8Array.from({ length: 300_000 }, (_, index) => index % 251),
  )

  it('reads exactly the range asked for, however large', async () => {
    const source = new FileArchiveSource(path)
    const { data } = await source.getBytes(120_000, 150_000)
    const bytes = new Uint8Array(data)
    expect(bytes.byteLength).toBe(150_000)
    expect(bytes[0]).toBe(120_000 % 251)
    expect(bytes[149_999]).toBe((120_000 + 149_999) % 251)
  })

  it('stops at the end of the file', async () => {
    const { data } = await new FileArchiveSource(path).getBytes(299_990, 100)
    expect(data.byteLength).toBe(10)
  })
})
