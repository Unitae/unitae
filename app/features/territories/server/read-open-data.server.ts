import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { parse } from 'csv'
import { safeOpenDataFetch } from './safe-open-data-fetch.server'

/** One address of the source file, in a postcode the congregation covers. */
export interface OpenDataAddress {
  number: string
  street: string
  zip: string
  latitude: number | null
  longitude: number | null
}

export type OpenDataSourceErrorCode = 'unreachable' | 'refused' | 'too-large' | 'unreadable'

/** Why the source file could not be read. Nothing has been written when this is thrown. */
export class OpenDataSourceError extends Error {
  constructor(
    readonly code: OpenDataSourceErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'OpenDataSourceError'
  }
}

// Decompressed, so a small gzip that inflates without end is stopped too. The largest
// département file (Nord) is about 80 MB; the national file is several gigabytes.
const MAX_BYTES = 200 * 1024 * 1024
const GZIP_MAGIC = [0x1f, 0x8b]

interface ReadOptions {
  maxBytes?: number
  onProgress?: (percent: number) => void
}

/**
 * Downloads a BANO CSV (`id,number,street,zip,city,source,lat,lon`, optionally gzipped) and
 * returns its addresses in `wantedZips`, each address once. It reads the whole file before
 * returning and writes nothing, so a caller can import the result in short transactions.
 * Progress is the share of the file received, when the source states its size.
 */
export async function readOpenDataAddresses(
  url: string,
  wantedZips: string[],
  { maxBytes = MAX_BYTES, onProgress }: ReadOptions = {},
): Promise<OpenDataAddress[]> {
  const response = await fetchSource(url)
  if (response.status !== 200 || response.body == null) {
    throw new OpenDataSourceError('refused', `Open-data source answered ${response.status}`)
  }

  const total = Number(response.headers.get('content-length')) || 0
  const chunks = withProgress(response.body, total, onProgress)
  const first = await chunks.next()
  const gzipped = !first.done && GZIP_MAGIC.every((byte, index) => first.value[index] === byte)

  const wanted = new Set(wantedZips)
  const addresses = new Map<string, OpenDataAddress>()

  try {
    await pipeline(
      Readable.from(replay(first, chunks)),
      ...(gzipped ? [createGunzip()] : []),
      byteLimit(maxBytes),
      parse({ delimiter: ',' }),
      async (records: AsyncIterable<string[]>) => {
        for await (const [, number, street, zip, , , lat, lon] of records) {
          const key = `${number}\u0000${street}\u0000${zip}`
          if (!wanted.has(zip) || addresses.has(key)) continue
          addresses.set(key, { number, street, zip, latitude: coordinate(lat), longitude: coordinate(lon) })
        }
      },
    )
  } catch (error) {
    if (error instanceof OpenDataSourceError) throw error
    throw new OpenDataSourceError('unreadable', 'Open-data file could not be read', { cause: error })
  }

  return [...addresses.values()]
}

async function fetchSource(url: string): Promise<Response> {
  try {
    return await safeOpenDataFetch(url)
  } catch (error) {
    throw new OpenDataSourceError('unreachable', 'Open-data source could not be reached', { cause: error })
  }
}

async function* withProgress(
  body: AsyncIterable<Uint8Array>,
  total: number,
  onProgress: ((percent: number) => void) | undefined,
): AsyncGenerator<Uint8Array> {
  let received = 0
  let reported = -1
  try {
    for await (const chunk of body) {
      received += chunk.length
      const percent = total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : -1
      if (onProgress && percent > reported) {
        reported = percent
        onProgress(percent)
      }
      yield chunk
    }
  } catch (error) {
    throw new OpenDataSourceError('unreachable', 'Open-data download was interrupted', { cause: error })
  }
}

async function* replay(
  first: IteratorResult<Uint8Array>,
  rest: AsyncGenerator<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  if (first.done) return
  yield first.value
  yield* rest
}

function byteLimit(maxBytes: number): Transform {
  let seen = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length
      if (seen > maxBytes) {
        callback(new OpenDataSourceError('too-large', `Open-data file exceeds ${maxBytes} bytes`))
        return
      }
      callback(null, chunk)
    },
  })
}

function coordinate(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
