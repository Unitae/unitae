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

const { guardLoginAttempt, releaseLoginAttempt, guardTwoFactorAttempt, releaseTwoFactorAttempts } = await import(
  './rate-limit.server'
)
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
