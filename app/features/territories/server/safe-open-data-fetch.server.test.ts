import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ValidationError } from '~/shared/errors/app-error.server'

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))

import { lookup } from 'node:dns/promises'
import { capBytes, isBlockedAddress, MAX_REDIRECTS, safeOpenDataFetch } from './safe-open-data-fetch.server'

const lookupMock = vi.mocked(lookup)
const originalFetch = globalThis.fetch
const originalAllowlist = process.env.UNITAE_OPEN_DATA_ALLOWLIST

// A default allowlisted BANO host used across the fetch cases.
const ALLOWED = 'https://bano.openstreetmap.fr/data/bano.csv'
const TOO_MANY_REDIRECTS = /redirection/i

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
    '0:0:0:0:0:0:0:1', // expanded loopback (canonicalised form must still block)
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1', // IPv4-mapped, dotted
    '::ffff:7f00:1', // IPv4-mapped loopback, hex
    '::ffff:a9fe:a9fe', // IPv4-mapped 169.254.169.254, hex
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

  it('rejects when DNS resolution throws (fail closed)', async () => {
    lookupMock.mockRejectedValue(new Error('EAI_AGAIN'))
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    await expect(safeOpenDataFetch(ALLOWED)).rejects.toBeInstanceOf(ValidationError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects when DNS resolves to no addresses (fail closed)', async () => {
    lookupMock.mockResolvedValue([] as never)
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    await expect(safeOpenDataFetch(ALLOWED)).rejects.toBeInstanceOf(ValidationError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches the validated URL with manual redirect handling', async () => {
    publicDns()
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200, body: null })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const response = await safeOpenDataFetch(ALLOWED)

    expect(response.status).toBe(200)
    const [requestedUrl, options] = fetchSpy.mock.calls[0]
    expect(requestedUrl.toString()).toBe(ALLOWED)
    expect(options.redirect).toBe('manual')
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('follows a redirect to another allowlisted host and re-validates it', async () => {
    publicDns()
    const redirectTarget = 'https://adresse.data.gouv.fr/data/bano.csv'
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ status: 302, headers: new Headers({ location: redirectTarget }) })
      .mockResolvedValueOnce({ status: 200, body: null })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const response = await safeOpenDataFetch(ALLOWED)

    expect(response.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(fetchSpy.mock.calls[1][0].toString()).toBe(redirectTarget)
  })

  it('resolves a relative redirect Location against the current host', async () => {
    publicDns()
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ status: 301, headers: new Headers({ location: '/data/other.csv' }) })
      .mockResolvedValueOnce({ status: 200, body: null })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const response = await safeOpenDataFetch(ALLOWED)

    expect(response.status).toBe(200)
    expect(fetchSpy.mock.calls[1][0].toString()).toBe('https://bano.openstreetmap.fr/data/other.csv')
  })

  it('rejects a protocol-relative redirect to a disallowed host', async () => {
    publicDns()
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ status: 302, headers: new Headers({ location: '//evil.example.com/x' }) }) as never

    await expect(safeOpenDataFetch(ALLOWED)).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects once the redirect chain exceeds MAX_REDIRECTS', async () => {
    publicDns()
    // Always redirect to an allowlisted host so the loop is bounded only by MAX_REDIRECTS.
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 302, headers: new Headers({ location: ALLOWED }) }) as never

    await expect(safeOpenDataFetch(ALLOWED)).rejects.toThrow(TOO_MANY_REDIRECTS)
    expect(MAX_REDIRECTS).toBeGreaterThan(0)
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
