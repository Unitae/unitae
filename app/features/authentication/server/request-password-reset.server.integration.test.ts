import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { unscopedDb } from '~/shared/infra/db.server'
import { redis, redisRateLimit } from '~/shared/infra/redis.server'

const { requestPasswordReset } = await import('./request-password-reset.server')

// Unique per run so the counter starts clean and never collides with a parallel suite.
const UNKNOWN_EMAIL = `reset-unknown-${Date.now()}@nowhere.test`
const RATE_LIMIT_KEY = `password_reset_attempts:${UNKNOWN_EMAIL}`

beforeAll(async () => {
  await redisRateLimit.del(RATE_LIMIT_KEY)
})

afterAll(async () => {
  await redisRateLimit.del(RATE_LIMIT_KEY)
  redisRateLimit.disconnect()
  redis.disconnect()
  await unscopedDb.$disconnect()
})

describe('requestPasswordReset (integration) — rate-limit recording', () => {
  it('compte chaque tentative sur un email inconnu et finit par le limiter', async () => {
    // An unknown email must still consume the reset budget — otherwise the presence
    // or absence of rate-limiting is itself an account-enumeration oracle.
    const statuses: string[] = []
    for (let i = 0; i < 3; i++) {
      const result = await requestPasswordReset(UNKNOWN_EMAIL)
      statuses.push(result.status)
    }

    // The three allowed attempts all fell through to "no-user" (no account exists)…
    expect(statuses).toEqual(['no-user', 'no-user', 'no-user'])
    // …yet each was recorded in Redis.
    expect(await redisRateLimit.get(RATE_LIMIT_KEY)).toBe('3')

    // The next attempt on the same unknown email is now rate-limited.
    const fourth = await requestPasswordReset(UNKNOWN_EMAIL)
    expect(fourth.status).toBe('rate-limited')
    // A rate-limited attempt does not increment the counter further.
    expect(await redisRateLimit.get(RATE_LIMIT_KEY)).toBe('3')
  })
})
