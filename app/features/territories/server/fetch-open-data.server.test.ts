import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOpenData } from './fetch-open-data.server'

const mockDb = { setting: { findFirst: vi.fn() } }
// biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
const dbCast = mockDb as any

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

async function collectRows(stream: NodeJS.ReadableStream, timeoutMs = 500): Promise<unknown[]> {
  const rows: unknown[] = []
  const collector = (async () => {
    for await (const row of stream) rows.push(row)
  })()
  await Promise.race([collector, new Promise<void>(resolve => setTimeout(resolve, timeoutMs))])
  return rows
}

describe('fetchOpenData', () => {
  it('does not call fetch when the `bano-url` setting is missing', async () => {
    mockDb.setting.findFirst.mockResolvedValue(null)
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    await fetchOpenData(dbCast)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not call fetch when the `bano-url` value is blank', async () => {
    mockDb.setting.findFirst.mockResolvedValue({ value: '' })
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    await fetchOpenData(dbCast)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('emits an empty row set when fetch responds with a non-200 status', async () => {
    mockDb.setting.findFirst.mockResolvedValue({ value: 'https://open-data/bano.csv' })
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 500, body: null }) as unknown as typeof fetch

    const stream = await fetchOpenData(dbCast)
    // Iterating the empty stream must terminate cleanly (regression guard: an
    // earlier implementation returned `new Readable()` with no _read, which
    // threw ERR_METHOD_NOT_IMPLEMENTED on the first pull).
    expect(await collectRows(stream, 1000)).toEqual([])
  })

  it('emits an empty row set when the `bano-url` setting is missing (empty stream terminates cleanly)', async () => {
    mockDb.setting.findFirst.mockResolvedValue(null)
    const stream = await fetchOpenData(dbCast)
    expect(await collectRows(stream, 1000)).toEqual([])
  })

  it('pipes the fetch response body through a CSV parser on success', async () => {
    mockDb.setting.findFirst.mockResolvedValue({ value: 'https://open-data/bano.csv' })

    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('a,b,c\n1,2,3\n4,5,6\n'))
        controller.close()
      },
    })
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200, body: responseBody }) as unknown as typeof fetch

    const stream = await fetchOpenData(dbCast)
    const rows = await collectRows(stream, 2000)
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ])
  })

  it('threads the `bano-url` key into the findFirst filter', async () => {
    mockDb.setting.findFirst.mockResolvedValue(null)
    await fetchOpenData(dbCast)
    expect(mockDb.setting.findFirst).toHaveBeenCalledWith({ where: { key: 'bano-url' } })
  })
})
