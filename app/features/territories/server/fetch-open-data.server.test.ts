import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ValidationError } from '~/shared/errors/app-error.server'

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))
vi.mock('~/shared/infra/logger.server', () => {
  const stub = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { createLogger: () => stub, logger: stub, default: stub }
})

import { lookup } from 'node:dns/promises'
import { fetchOpenData } from './fetch-open-data.server'

const mockDb = { setting: { findFirst: vi.fn() } }
// biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
const dbCast = mockDb as any

const lookupMock = vi.mocked(lookup)
const originalFetch = globalThis.fetch

// An allowlisted BANO host resolving to a public address for the happy paths.
const ALLOWED_URL = 'https://bano.openstreetmap.fr/data/bano.csv'

beforeEach(() => {
  vi.clearAllMocks()
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// Drains to completion (the mocked streams all end), so a stream error rejects
// instead of being masked by a timeout race.
async function collectRows(stream: NodeJS.ReadableStream): Promise<unknown[]> {
  const rows: unknown[] = []
  for await (const row of stream) rows.push(row)
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

  it('rejects a disallowed URL without hitting the network (so the sync transaction rolls back)', async () => {
    mockDb.setting.findFirst.mockResolvedValue({ value: 'http://169.254.169.254/latest/meta-data/' })
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    await expect(fetchOpenData(dbCast)).rejects.toBeInstanceOf(ValidationError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('propagates a mid-stream body error to the consumer instead of crashing the worker', async () => {
    mockDb.setting.findFirst.mockResolvedValue({ value: ALLOWED_URL })
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('a,b,c\n'))
        controller.error(new Error('connection reset'))
      },
    })
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200, body }) as unknown as typeof fetch

    const stream = await fetchOpenData(dbCast)
    // The error must surface on the returned stream (rejects), not as an
    // unhandled 'error' event that takes down the worker process.
    await expect(collectRows(stream)).rejects.toThrow()
  })

  it('emits an empty row set when fetch responds with a non-200 status', async () => {
    mockDb.setting.findFirst.mockResolvedValue({ value: ALLOWED_URL })
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 500, body: null }) as unknown as typeof fetch

    const stream = await fetchOpenData(dbCast)
    // Iterating the empty stream must terminate cleanly (regression guard: an
    // earlier implementation returned `new Readable()` with no _read, which
    // threw ERR_METHOD_NOT_IMPLEMENTED on the first pull).
    expect(await collectRows(stream)).toEqual([])
  })

  it('emits an empty row set when the `bano-url` setting is missing (empty stream terminates cleanly)', async () => {
    mockDb.setting.findFirst.mockResolvedValue(null)
    const stream = await fetchOpenData(dbCast)
    expect(await collectRows(stream)).toEqual([])
  })

  it('pipes the fetch response body through a CSV parser on success', async () => {
    mockDb.setting.findFirst.mockResolvedValue({ value: ALLOWED_URL })

    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('a,b,c\n1,2,3\n4,5,6\n'))
        controller.close()
      },
    })
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200, body: responseBody }) as unknown as typeof fetch

    const stream = await fetchOpenData(dbCast)
    const rows = await collectRows(stream)
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
