import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/redis.server', () => ({
  redisRateLimit: {
    eval: vi.fn(),
    del: vi.fn(),
  },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const {
  guardLoginAttempt,
  releaseLoginAttempt,
  guardTwoFactorAttempt,
  releaseTwoFactorAttempts,
  guardPasswordResetRequest,
} = await import('./rate-limit.server')
const { redisRateLimit: redis } = await import('~/shared/infra/redis.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('guardLoginAttempt', () => {
  it('allows the attempt when both per-IP and global counts stay under their limits', async () => {
    // First eval = per-IP counter, second = global counter.
    vi.mocked(redis.eval).mockResolvedValueOnce(1).mockResolvedValueOnce(1)

    const result = await guardLoginAttempt('203.0.113.7')

    expect(result).toEqual({ limited: false })
  })

  it('allows the attempt exactly at the per-IP limit (boundary)', async () => {
    // Default per-IP max is 10 → a count of 10 is still allowed.
    vi.mocked(redis.eval).mockResolvedValueOnce(10).mockResolvedValueOnce(1)

    const result = await guardLoginAttempt('203.0.113.7')

    expect(result).toEqual({ limited: false })
  })

  it('blocks the attempt when the per-IP count exceeds the limit', async () => {
    // Count of 11 > default max 10.
    vi.mocked(redis.eval).mockResolvedValueOnce(11)

    const result = await guardLoginAttempt('203.0.113.7')

    expect(result).toEqual({ limited: true })
  })

  it('does not touch the global counter once the per-IP limit is exceeded', async () => {
    vi.mocked(redis.eval).mockResolvedValueOnce(11)

    await guardLoginAttempt('203.0.113.7')

    expect(redis.eval).toHaveBeenCalledTimes(1)
  })

  it('blocks the attempt when the global count exceeds the limit', async () => {
    // Per-IP under limit (1), global over default max 100.
    vi.mocked(redis.eval).mockResolvedValueOnce(1).mockResolvedValueOnce(101)

    const result = await guardLoginAttempt('203.0.113.7')

    expect(result).toEqual({ limited: true })
  })

  it('fails closed (blocks) when Redis is unavailable', async () => {
    vi.mocked(redis.eval).mockRejectedValue(new Error('Redis down'))

    const result = await guardLoginAttempt('203.0.113.7')

    expect(result).toEqual({ limited: true })
  })

  it('buckets a missing IP under a shared "unknown" key', async () => {
    vi.mocked(redis.eval).mockResolvedValueOnce(1).mockResolvedValueOnce(1)

    await guardLoginAttempt(undefined)

    // eval(script, numKeys, key, ...args): the key is the third argument.
    const perIpKey = vi.mocked(redis.eval).mock.calls[0]?.[2]
    expect(perIpKey).toBe('login_fail:ip:unknown')
  })

  it('keys the per-IP counter on the provided IP', async () => {
    vi.mocked(redis.eval).mockResolvedValueOnce(1).mockResolvedValueOnce(1)

    await guardLoginAttempt('203.0.113.7')

    const perIpKey = vi.mocked(redis.eval).mock.calls[0]?.[2]
    expect(perIpKey).toBe('login_fail:ip:203.0.113.7')
  })
})

describe('releaseLoginAttempt', () => {
  it('decrements both the per-IP and global counters', async () => {
    vi.mocked(redis.eval).mockResolvedValue(0)

    await releaseLoginAttempt('203.0.113.7')

    const keys = vi.mocked(redis.eval).mock.calls.map(call => call[2])
    expect(keys).toContain('login_fail:ip:203.0.113.7')
    expect(keys).toContain('login_fail:global')
  })

  it('does not throw when Redis is unavailable', async () => {
    vi.mocked(redis.eval).mockRejectedValue(new Error('Redis down'))

    await expect(releaseLoginAttempt('203.0.113.7')).resolves.toBeUndefined()
  })
})

describe('guardTwoFactorAttempt', () => {
  it('allows the attempt while the per-account count stays under the limit', async () => {
    vi.mocked(redis.eval).mockResolvedValueOnce(1)

    expect(await guardTwoFactorAttempt(42)).toEqual({ limited: false })
  })

  it('allows the attempt exactly at the limit (boundary)', async () => {
    // Default per-account max is 5 → a count of 5 is still allowed.
    vi.mocked(redis.eval).mockResolvedValueOnce(5)

    expect(await guardTwoFactorAttempt(42)).toEqual({ limited: false })
  })

  it('blocks the attempt when the per-account count exceeds the limit', async () => {
    vi.mocked(redis.eval).mockResolvedValueOnce(6)

    expect(await guardTwoFactorAttempt(42)).toEqual({ limited: true })
  })

  it('keys the counter on the pending account', async () => {
    vi.mocked(redis.eval).mockResolvedValueOnce(1)

    await guardTwoFactorAttempt(42)

    expect(vi.mocked(redis.eval).mock.calls[0]?.[2]).toBe('two_factor_fail:user:42')
  })

  it('fails closed (blocks) when Redis is unavailable', async () => {
    vi.mocked(redis.eval).mockRejectedValue(new Error('Redis down'))

    expect(await guardTwoFactorAttempt(42)).toEqual({ limited: true })
  })
})

describe('releaseTwoFactorAttempts', () => {
  it('deletes the per-account counter', async () => {
    vi.mocked(redis.del).mockResolvedValue(1)

    await releaseTwoFactorAttempts(42)

    expect(redis.del).toHaveBeenCalledWith('two_factor_fail:user:42')
  })

  it('does not throw when Redis is unavailable', async () => {
    vi.mocked(redis.del).mockRejectedValue(new Error('Redis down'))

    await expect(releaseTwoFactorAttempts(42)).resolves.toBeUndefined()
  })
})

// In-memory Redis counters: each key counts the requests made in its window, so these tests assert
// on whether a request is allowed rather than on calls to Redis.
describe('guardPasswordResetRequest', () => {
  let counters: Map<string, number>

  // Ends every counter whose key contains `fragment`, as if its window had elapsed.
  function elapse(fragment: string) {
    for (const key of [...counters.keys()]) if (key.includes(fragment)) counters.delete(key)
  }

  async function requestTimes(times: number, email: string, ip: string) {
    const results: boolean[] = []
    for (let i = 0; i < times; i++) results.push((await guardPasswordResetRequest(email, ip)).limited)
    return results
  }

  beforeEach(() => {
    counters = new Map()
    vi.mocked(redis.eval).mockImplementation(((_script: string, _keys: number, key: string) => {
      const count = (counters.get(key) ?? 0) + 1
      counters.set(key, count)
      return Promise.resolve(count)
    }) as never)
  })

  it('allows three requests for one address in a window, then limits it', async () => {
    expect(await requestTimes(4, 'Victim@Example.com', '203.0.113.7')).toEqual([false, false, false, true])
  })

  it('counts an address the same whatever its case', async () => {
    await requestTimes(3, 'victim@example.com', '203.0.113.7')

    expect((await guardPasswordResetRequest('VICTIM@example.com', '203.0.113.8')).limited).toBe(true)
  })

  it('caps one address at five requests a day, across windows and IPs', async () => {
    await requestTimes(3, 'victim@example.com', '203.0.113.7')
    elapse(':window:')
    await requestTimes(2, 'victim@example.com', '198.51.100.9')
    elapse(':window:')

    expect((await guardPasswordResetRequest('victim@example.com', '192.0.2.4')).limited).toBe(true)
  })

  it('caps one client at ten requests a window, whatever the addresses', async () => {
    const results: boolean[] = []
    for (let i = 0; i < 11; i++) {
      results.push((await guardPasswordResetRequest(`person${i}@example.com`, '203.0.113.7')).limited)
    }

    expect(results.slice(0, 10).every(limited => !limited)).toBe(true)
    expect(results[10]).toBe(true)
    // Another client is unaffected.
    expect((await guardPasswordResetRequest('someone@example.com', '198.51.100.9')).limited).toBe(false)
  })

  it('fails closed when Redis is unavailable', async () => {
    vi.mocked(redis.eval).mockRejectedValue(new Error('connection refused'))

    expect(await guardPasswordResetRequest('victim@example.com', '203.0.113.7')).toEqual({ limited: true })
  })
})
