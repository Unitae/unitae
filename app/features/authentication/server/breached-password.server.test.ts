import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isPasswordBreached } from './breached-password.server'

// Mirror the HIBP k-anonymity split so we can build a realistic range body
// without reaching into the module internals.
function rangeSuffix(password: string): string {
  return createHash('sha1').update(password).digest('hex').toUpperCase().slice(5)
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status })
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isPasswordBreached', () => {
  it('returns true when the suffix appears in the range response', async () => {
    const password = 'hunter2breachme'
    fetchMock.mockResolvedValue(textResponse(`${rangeSuffix(password)}:42\r\n0000000000000000000000000000000000A:1`))

    expect(await isPasswordBreached(password)).toBe(true)
  })

  it('matches the suffix case-insensitively', async () => {
    const password = 'hunter2breachme'
    fetchMock.mockResolvedValue(textResponse(`${rangeSuffix(password).toLowerCase()}:42`))

    expect(await isPasswordBreached(password)).toBe(true)
  })

  it('returns false when the suffix is absent from the range response', async () => {
    fetchMock.mockResolvedValue(
      textResponse('0000000000000000000000000000000000A:1\r\n1111111111111111111111111111111111B:2'),
    )

    expect(await isPasswordBreached('a-fresh-unseen-passphrase')).toBe(false)
  })

  it('degrades open (false) on a 200 with a malformed/non-range body (e.g. a CDN error page)', async () => {
    fetchMock.mockResolvedValue(textResponse('<html><body>Service Unavailable</body></html>'))

    expect(await isPasswordBreached('whatever')).toBe(false)
  })

  it('degrades open (false) when the network call rejects', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    expect(await isPasswordBreached('whatever')).toBe(false)
  })

  it('degrades open (false) when the request aborts/times out', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))

    expect(await isPasswordBreached('whatever')).toBe(false)
  })

  it('degrades open (false) on a non-200 response', async () => {
    fetchMock.mockResolvedValue(textResponse('rate limited', 429))

    expect(await isPasswordBreached('whatever')).toBe(false)
  })

  it('queries the HIBP range endpoint with the 5-char SHA-1 prefix', async () => {
    fetchMock.mockResolvedValue(textResponse(''))
    const expectedPrefix = createHash('sha1').update('probe').digest('hex').toUpperCase().slice(0, 5)

    await isPasswordBreached('probe')

    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${expectedPrefix}`)
  })
})
