import { createHash } from 'node:crypto'
import { type FileHandle, open } from 'node:fs/promises'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import { Compression, EtagMismatch, PMTiles, type RangeResponse, type Source } from 'pmtiles'
import { getS3Client } from '~/shared/infra/file-storage.server'
import logger from '~/shared/infra/logger.server'
import { getOptionalEnv } from '~/shared/utils/env.server'

// The map's base tiles: one PMTiles archive (Protomaps), named by `UNITAE_MAP_TILES`: a path on the server, an
// `s3://bucket/key` read with the instance's storage credentials (a private bucket), or a public http(s) URL. The app
// serves its tiles itself — the browser never reaches the archive — and keeps the recent ones in memory. Without the
// variable there is no on-screen map.

export interface MapTile {
  /** The vector tile, gzipped. */
  data: Uint8Array<ArrayBuffer>
  /** The `Content-Encoding` to send it with. */
  encoding: 'gzip'
}

interface ArchiveHeader {
  tileCompression: number
  rootDirectoryOffset: number
  rootDirectoryLength: number
  tileDataLength?: number
  numTileEntries: number
  numAddressedTiles: number
  maxZoom: number
  etag?: string
}

/** The part of the pmtiles reader the store uses. */
export interface TileArchive {
  getHeader(): Promise<ArchiveHeader>
  getZxy(z: number, x: number, y: number): Promise<{ data: ArrayBuffer } | undefined>
}

export interface TileStore {
  /** Changes when the archive is replaced: tile addresses carry it, so browsers may keep a tile for good. */
  edition(): Promise<string>
  /** The deepest zoom the archive holds; maps enlarge its tiles past it. */
  maxZoom(): Promise<number>
  tile(z: number, x: number, y: number): Promise<MapTile | null>
}

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024
/** What an entry costs beyond its bytes (key, map node, object): an empty tile is not free. */
const ENTRY_COST = 256
const REMOTE = /^https?:\/\//
const S3_LOCATION = /^s3:\/\/([^/]+)\/(.+)$/

const gzipped = promisify(gzip)

/** The archive reader decompresses gzip itself (and nothing else): other archives are refused. */
function assertReadable(compression: number) {
  if (compression === Compression.Gzip || compression === Compression.None || compression === Compression.Unknown)
    return
  throw new Error(`Map tiles: the archive's tile compression (${compression}) is not supported`)
}

/** A short name for the archive's contents, from the header fields that change with them. */
function editionOf(header: ArchiveHeader): string {
  const fields = [
    header.rootDirectoryOffset,
    header.rootDirectoryLength,
    header.tileDataLength ?? 0,
    header.numTileEntries,
    header.numAddressedTiles,
    header.maxZoom,
    header.etag ?? '',
  ]
  return createHash('sha256').update(fields.join('|')).digest('hex').slice(0, 10)
}

/** Tiles from an archive, the most recently used kept in memory up to `maxBytes`, a tile read once at a time. */
export function createTileStore(archive: TileArchive, { maxBytes = DEFAULT_MAX_BYTES } = {}): TileStore {
  let header: Promise<ArchiveHeader> | null = null
  const readHeader = () => {
    header ??= archive.getHeader().catch(error => {
      header = null
      throw error
    })
    return header
  }
  const cache = new Map<string, MapTile | null>()
  const reading = new Map<string, Promise<MapTile | null>>()
  let bytes = 0

  const weight = (tile: MapTile | null) => ENTRY_COST + (tile?.data.byteLength ?? 0)
  const remember = (key: string, tile: MapTile | null) => {
    cache.set(key, tile)
    bytes += weight(tile)
    for (const [oldest, old] of cache) {
      if (bytes <= maxBytes) break
      cache.delete(oldest)
      bytes -= weight(old)
    }
  }

  return {
    edition: async () => editionOf(await readHeader()),
    maxZoom: async () => (await readHeader()).maxZoom,
    tile(z, x, y) {
      const key = `${z}/${x}/${y}`
      if (cache.has(key)) {
        const tile = cache.get(key) ?? null
        // Most recently used goes to the end of the line.
        cache.delete(key)
        cache.set(key, tile)
        return Promise.resolve(tile)
      }
      const pending = reading.get(key)
      if (pending != null) return pending
      const read = (async () => {
        assertReadable((await readHeader()).tileCompression)
        // The reader hands the tile decompressed: gzip it once here, so memory and the network carry it small.
        const found = await archive.getZxy(z, x, y)
        const tile: MapTile | null =
          found == null ? null : { data: new Uint8Array(await gzipped(new Uint8Array(found.data))), encoding: 'gzip' }
        remember(key, tile)
        return tile
      })().finally(() => reading.delete(key))
      reading.set(key, read)
      return read
    },
  }
}

/** Reads an archive kept on the server's disk, through one file handle. */
export class FileArchiveSource implements Source {
  private handle: Promise<FileHandle> | null = null

  constructor(private readonly path: string) {}

  getKey() {
    return this.path
  }

  /** The server keeps its archive open for its whole life; this is for whoever opens one briefly. */
  async close() {
    const handle = this.handle
    this.handle = null
    await (await handle)?.close()
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    this.handle ??= open(this.path, 'r')
    const handle = await this.handle
    const buffer = Buffer.alloc(length)
    // A read may return less than asked: keep reading until the range is whole or the file ends.
    let filled = 0
    while (filled < length) {
      const { bytesRead } = await handle.read(buffer, filled, length - filled, offset + filled)
      if (bytesRead === 0) break
      filled += bytesRead
    }
    return { data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + filled) }
  }
}

/** The part of an S3 client the archive needs: ranged GETs. */
interface RangeClient {
  send(command: { input: unknown }): Promise<{
    Body?: { transformToByteArray(): Promise<Uint8Array> }
    ETag?: string
  }>
}

/** Reads an archive kept in a private bucket, by ranges, with the instance's storage credentials. */
export class S3ArchiveSource implements Source {
  private client: Promise<RangeClient> | null = null

  constructor(
    private readonly bucket: string,
    private readonly key: string,
    private readonly createClient: () => Promise<RangeClient> = getS3Client as () => Promise<RangeClient>,
  ) {}

  getKey() {
    return `s3://${this.bucket}/${this.key}`
  }

  async getBytes(offset: number, length: number, _signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    this.client ??= this.createClient()
    const range = `bytes=${offset}-${offset + length - 1}`
    try {
      const response = await (await this.client).send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key, Range: range, ...(etag ? { IfMatch: etag } : {}) }),
      )
      const bytes = (await response.Body?.transformToByteArray()) ?? new Uint8Array()
      return {
        data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        etag: response.ETag,
      }
    } catch (error) {
      // The object changed under the reader: it re-reads the header and the directories.
      if (error instanceof Error && error.name === 'PreconditionFailed') throw new EtagMismatch()
      throw error
    }
  }
}

function openArchive(location: string): TileArchive {
  const s3 = S3_LOCATION.exec(location)
  if (s3 != null) return new PMTiles(new S3ArchiveSource(s3[1], s3[2]))
  return new PMTiles(REMOTE.test(location) ? location : new FileArchiveSource(location))
}

let opened: { location: string; store: TileStore } | null = null

/** The instance's map tiles, or null when it names no archive (no on-screen map then). */
export function getMapTiles(): TileStore | null {
  const location = getOptionalEnv('UNITAE_MAP_TILES')?.trim()
  if (location == null || location === '') return null
  if (opened?.location !== location) {
    logger.info('Map tiles: reading the archive', {
      tag: 'map-tiles',
      from: S3_LOCATION.test(location) ? 'bucket' : REMOTE.test(location) ? 'url' : 'file',
    })
    opened = { location, store: createTileStore(openArchive(location)) }
  }
  return opened.store
}
