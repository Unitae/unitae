import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ValidationError } from '~/shared/errors/app-error.server'

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))

import { lookup } from 'node:dns/promises'
import { capBytes, isBlockedAddress, safeOpenDataFetch } from './safe-open-data-fetch.server'

const lookupMock = vi.mocked(lookup)
const originalFetch = globalThis.fetch
const originalAllowlist = process.env.UNITAE_OPEN_DATA_ALLOWLIST

// A default allowlisted BANO host used across the fetch cases.
const ALLOWED = 'https://bano.openstreetmap.fr/data/bano.csv'

function publicDns() {
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
}

async function collect(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks).toString('utf8')
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.UNITAE_OPEN_DATA_ALLOWLIST
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalAllowlist === undefined) delete process.env.UNITAE_OPEN_DATA_ALLOWLIST
  else process.env.UNITAE_OPEN_DATA_ALLOWLIST = originalAllowlist
})

describe('isBlockedAddress', () => {
  it.each([
    '0.0.0.0',
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
  ])('blocks the private/loopback/link-local address %s', ip => {
    expect(isBlockedAddress(ip)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'])('allows the public address %s', ip => {
    expect(isBlockedAddress(ip)).toBe(false)
  })

  it('blocks a value that is not a valid IP', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true)
  })
})

describe('safeOpenDataFetch', () => {
  it('rejects a non-https scheme without hitting the network', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    await expect(safeOpenDataFetch('http://bano.openstreetmap.fr/x.csv')).rejects.toBeInstanceOf(ValidationError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a host that is not allowlisted without hitting the network', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    await expect(safeOpenDataFetch('https://evil.example.com/x.csv')).rejects.toBeInstanceOf(ValidationError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects when the host resolves to a private address', async () => {
    lookupMock.mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never)
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    await expect(safeOpenDataFetch(ALLOWED)).rejects.toBeInstanceOf(ValidationError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a redirect that points at a disallowed host', async () => {
    publicDns()
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ status: 302, headers: new Headers({ location: 'https://evil.example.com/' }) }) as never

    await expect(safeOpenDataFetch(ALLOWED)).rejects.toBeInstanceOf(ValidationError)
  })

  it('returns the final response for an allowlisted host resolving to a public address', async () => {
    publicDns()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('a,b,c\n'))
        controller.close()
      },
    })
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200, body }) as never

    const response = await safeOpenDataFetch(ALLOWED)
    expect(response.status).toBe(200)
  })
})

describe('capBytes', () => {
  it('passes data through when under the cap', async () => {
    const source = Readable.from([Buffer.from('123'), Buffer.from('456')])
    expect(await collect(capBytes(source, 100))).toBe('123456')
  })

  it('errors the stream once the byte cap is exceeded', async () => {
    const source = Readable.from([Buffer.from('123'), Buffer.from('456')])
    await expect(collect(capBytes(source, 4))).rejects.toThrow()
  })
})
