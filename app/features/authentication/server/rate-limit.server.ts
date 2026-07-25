import logger from '~/shared/infra/logger.server'
import { redisRateLimit as redis } from '~/shared/infra/redis.server'

const MAX_PASSWORD_RESET_ATTEMPTS = 3
const WINDOW_SECONDS = 15 * 60 // 15 minutes

// Login limits are keyed on the client IP and on a global counter — never on the
// target email, so no one can lock a specific victim out by burning their budget.
// Both default generously for a congregation-sized deployment; SaaS operators can
// raise them via env. `null`/NaN env values fall back to the defaults.
const LOGIN_IP_MAX = Number(process.env.LOGIN_RATE_LIMIT_IP_MAX) || 10
const LOGIN_GLOBAL_MAX = Number(process.env.LOGIN_RATE_LIMIT_GLOBAL_MAX) || 100

const LOGIN_GLOBAL_KEY = 'login_fail:global'
const loginIpKey = (ip: string | undefined) => `login_fail:ip:${ip ?? 'unknown'}`

// Atomic increment-and-check: INCR the counter and, on the first hit of a new
// window, set its TTL — in one round trip so a concurrent burst cannot slip past a
// separate GET/INCR (the TOCTOU the old limiter had). Returns the post-increment
// count. Both scripts are static constants with only KEYS/ARGV parameterized —
// this is `redis.eval` (server-side Lua), not JS eval, and carries no injection risk.
const INCREMENT_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return count
`

// Undo one increment on a successful login so legitimate users don't consume budget.
// Guarded so the counter never goes negative and is cleaned up when it hits zero.
const DECREMENT_SCRIPT = `
  local count = redis.call('DECR', KEYS[1])
  if count <= 0 then
    redis.call('DEL', KEYS[1])
  end
  return count
`

async function incrementAndCount(key: string): Promise<number> {
  return Number(await redis.eval(INCREMENT_SCRIPT, 1, key, WINDOW_SECONDS))
}

/**
 * Gate a login attempt BEFORE the expensive credential check. Atomically counts the
 * attempt against a per-IP limit and a global limit. Fails CLOSED: if Redis is
 * unreachable we cannot enforce the limit, so we deny rather than silently allow
 * brute forcing during an outage.
 */
export async function guardLoginAttempt(ip: string | undefined): Promise<{ limited: boolean }> {
  try {
    const ipCount = await incrementAndCount(loginIpKey(ip))
    if (ipCount > LOGIN_IP_MAX) {
      logger.warn('Login blocked: per-IP rate limit exceeded', { ip })
      return { limited: true }
    }

    // Short-circuit keeps one IP's contribution to the global counter capped at
    // LOGIN_IP_MAX, so LOGIN_GLOBAL_MAX ≈ the number of distinct abusive IPs.
    const globalCount = await incrementAndCount(LOGIN_GLOBAL_KEY)
    if (globalCount > LOGIN_GLOBAL_MAX) {
      logger.warn('Login blocked: global rate limit exceeded')
      return { limited: true }
    }

    return { limited: false }
  } catch (error) {
    logger.error('Login rate limit check failed, denying request (fail-closed)', { error })
    return { limited: true }
  }
}

/** Release the counters incremented by `guardLoginAttempt` after a successful login. */
export async function releaseLoginAttempt(ip: string | undefined): Promise<void> {
  try {
    await redis.eval(DECREMENT_SCRIPT, 1, loginIpKey(ip))
    await redis.eval(DECREMENT_SCRIPT, 1, LOGIN_GLOBAL_KEY)
  } catch (error) {
    logger.warn('Failed to release login rate limit counters', { error })
  }
}

export async function checkPasswordResetRateLimit(email: string): Promise<boolean> {
  const key = `password_reset_attempts:${email.toLowerCase()}`

  try {
    const attempts = await redis.get(key)
    return Number(attempts ?? 0) < MAX_PASSWORD_RESET_ATTEMPTS
  } catch (error) {
    logger.warn('Password reset rate limit check failed, allowing request', { error })
    return true
  }
}

export async function recordPasswordResetAttempt(email: string): Promise<void> {
  const key = `password_reset_attempts:${email.toLowerCase()}`

  try {
    const current = await redis.incr(key)
    if (current === 1) {
      await redis.expire(key, WINDOW_SECONDS)
    }
  } catch (error) {
    logger.warn('Failed to record password reset attempt', { error })
  }
}
