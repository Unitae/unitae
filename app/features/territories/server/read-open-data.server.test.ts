import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))
vi.mock('~/shared/infra/logger.server', () => {
  const stub = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { createLogger: () => stub, logger: stub, default: stub }
})

import { lookup } from 'node:dns/promises'
import { OpenDataSourceError, readOpenDataAddresses } from './read-open-data.server'

const URL_CSV = 'https://bano.openstreetmap.fr/data/bano-93.csv'
const originalFetch = globalThis.fetch

function serve(body: BodyInit | null, init: ResponseInit = { status: 200 }) {
  globalThis.fetch = vi.fn(async () => new Response(body, init)) as unknown as typeof fetch
}

function chunked(parts: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(part)
      controller.close()
    },
  })
}

const CSV = [
  '930480001A-1,1,Rue de Paris,93260,Les Lilas,OSM,48.8801,2.4163',
  '930480002A-1,2,Rue de Paris,93260,Les Lilas,OSM,48.8802,2.4164',
  '930480003A-1,3,Rue Ailleurs,93100,Montreuil,OSM,48.86,2.44',
  '930480004A-1,1,Rue de Paris,93260,Les Lilas,CAD,48.8809,2.4169',
  '930480005A-1,7,Allée sans position,93260,Les Lilas,OSM,,',
].join('\n')

async function failureCode(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error instanceof OpenDataSourceError ? error.code : `not a source error: ${String(error)}`
  }
  return 'resolved'
}

beforeEach(() => {
  vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('readOpenDataAddresses', () => {
  it('keeps only the addresses in the wanted postcodes', async () => {
    serve(CSV)

    const addresses = await readOpenDataAddresses(URL_CSV, ['93260'])

    expect(addresses.map(a => `${a.number} ${a.street} ${a.zip}`)).toEqual([
      '1 Rue de Paris 93260',
      '2 Rue de Paris 93260',
      '7 Allée sans position 93260',
    ])
    expect(addresses[0]).toMatchObject({ latitude: 48.8801, longitude: 2.4163 })
  })

  it('keeps the first of an address the file lists twice', async () => {
    serve(CSV)

    const addresses = await readOpenDataAddresses(URL_CSV, ['93260'])

    expect(addresses.filter(a => a.number === '1' && a.street === 'Rue de Paris')).toEqual([
      { number: '1', street: 'Rue de Paris', zip: '93260', latitude: 48.8801, longitude: 2.4163 },
    ])
  })

  it('leaves the position empty when the file has none', async () => {
    serve(CSV)

    const addresses = await readOpenDataAddresses(URL_CSV, ['93260'])

    expect(addresses.find(a => a.number === '7')).toMatchObject({ latitude: null, longitude: null })
  })

  it('decompresses a gzip file, whatever its name', async () => {
    serve(gzipSync(Buffer.from(CSV)))

    const addresses = await readOpenDataAddresses(URL_CSV, ['93100'])

    expect(addresses.map(a => a.street)).toEqual(['Rue Ailleurs'])
  })

  it('refuses a file larger than the limit once decompressed', async () => {
    serve(gzipSync(Buffer.from(CSV.repeat(50))))

    expect(await failureCode(readOpenDataAddresses(URL_CSV, ['93260'], { maxBytes: 1_000 }))).toBe('too-large')
  })

  it('reports an answer other than 200 as a refusal', async () => {
    serve('Service Unavailable', { status: 503 })

    expect(await failureCode(readOpenDataAddresses(URL_CSV, ['93260']))).toBe('refused')
  })

  it('reports a network failure as unreachable', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch

    expect(await failureCode(readOpenDataAddresses(URL_CSV, ['93260']))).toBe('unreachable')
  })

  it('reports a file that is not a BANO CSV as unreadable', async () => {
    serve('<html>\n<body>"unterminated, quote</body>\n</html>')

    expect(await failureCode(readOpenDataAddresses(URL_CSV, ['93260']))).toBe('unreadable')
  })

  it('reports progress from the bytes received', async () => {
    const bytes = Buffer.from(CSV)
    const half = Math.floor(bytes.length / 2)
    serve(chunked([bytes.subarray(0, half), bytes.subarray(half)]), {
      status: 200,
      headers: { 'content-length': String(bytes.length) },
    })
    const seen: number[] = []

    await readOpenDataAddresses(URL_CSV, ['93260'], { onProgress: percent => seen.push(percent) })

    expect(seen).toEqual([Math.floor((half / bytes.length) * 100), 100])
  })
})
