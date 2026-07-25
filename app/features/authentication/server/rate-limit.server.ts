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

// The TOTP challenge is keyed on the pending account, not the IP: it only runs
// after the correct password, so a per-user cap throttles code brute-forcing
// without the victim-lockout problem the login limiter avoids (the account is
// already compromised if someone is at this step).
const TWO_FACTOR_MAX = Number(process.env.TWO_FACTOR_RATE_LIMIT_MAX) || 5

const LOGIN_GLOBAL_KEY = 'login_fail:global'
const loginIpKey = (ip: string | undefined) => `login_fail:ip:${ip ?? 'unknown'}`
const twoFactorKey = (userId: number) => `two_factor_fail:user:${userId}`

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

/**
 * Gate a TOTP challenge attempt BEFORE verifying the code. Atomically counts the
 * attempt against a per-account limit. Fails CLOSED like `guardLoginAttempt`.
 */
export async function guardTwoFactorAttempt(userId: number): Promise<{ limited: boolean }> {
  try {
    const count = await incrementAndCount(twoFactorKey(userId))
    if (count > TWO_FACTOR_MAX) {
      logger.warn('Two-factor challenge blocked: per-account rate limit exceeded', { userId })
      return { limited: true }
    }

    return { limited: false }
  } catch (error) {
    logger.error('Two-factor rate limit check failed, denying request (fail-closed)', { error })
    return { limited: true }
  }
}

/** Reset the challenge counter for an account after a successful TOTP verification. */
export async function releaseTwoFactorAttempts(userId: number): Promise<void> {
  try {
    await redis.del(twoFactorKey(userId))
  } catch (error) {
    logger.warn('Failed to release two-factor rate limit counter', { error })
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
