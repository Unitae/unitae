import logger from '~/shared/infra/logger.server'
import { redisRateLimit as redis } from '~/shared/infra/redis.server'

const WINDOW_SECONDS = 15 * 60 // 15 minutes
const DAY_SECONDS = 24 * 60 * 60

// Password-reset requests send an email to the address typed in, so they are capped per client (so
// one client cannot spray many addresses) and per address: 3 per 15 minutes is the flood guard, and
// a daily cap of 20 bounds what one inbox can receive. Worst case: anyone can spend an address's
// 20 daily requests, holding back its self-service reset until the window ends (at most 24 hours);
// an admin can still send a link from the user settings.
const PASSWORD_RESET_EMAIL_WINDOW_MAX = 3
const PASSWORD_RESET_EMAIL_DAY_MAX = 20
const PASSWORD_RESET_IP_WINDOW_MAX = 10

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

async function incrementAndCount(key: string, ttlSeconds = WINDOW_SECONDS): Promise<number> {
  return Number(await redis.eval(INCREMENT_SCRIPT, 1, key, ttlSeconds))
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

/**
 * Gate a password-reset request BEFORE looking the address up, so unknown addresses consume the
 * same budget as real ones (otherwise the limit itself would reveal which addresses have an
 * account). Counts the request per client, then per address in a window, then per address per day.
 * Fails CLOSED like `guardLoginAttempt`; the caller shows the same message either way.
 */
export type PasswordResetGuard = { limited: false } | { limited: true; reason: 'rate-limited' | 'unavailable' }

export async function guardPasswordResetRequest(email: string, ip: string | undefined): Promise<PasswordResetGuard> {
  const address = email.toLowerCase()
  if (ip == null) {
    // Every such request shares one per-client bucket, so the proxy setup needs attention.
    logger.error('Password reset request without a resolved client address; counted under "unknown"')
  }
  try {
    if ((await incrementAndCount(`password_reset:window:ip:${ip ?? 'unknown'}`)) > PASSWORD_RESET_IP_WINDOW_MAX) {
      logger.warn('Password reset blocked: per-client rate limit exceeded', { ip })
      return { limited: true, reason: 'rate-limited' }
    }
    if ((await incrementAndCount(`password_reset:window:email:${address}`)) > PASSWORD_RESET_EMAIL_WINDOW_MAX) {
      logger.warn('Password reset blocked: per-address rate limit exceeded')
      return { limited: true, reason: 'rate-limited' }
    }
    if ((await incrementAndCount(`password_reset:day:email:${address}`, DAY_SECONDS)) > PASSWORD_RESET_EMAIL_DAY_MAX) {
      logger.warn('Password reset blocked: per-address daily limit exceeded')
      return { limited: true, reason: 'rate-limited' }
    }
    return { limited: false }
  } catch (error) {
    logger.error('Password reset rate limit check failed, denying request (fail-closed)', { error })
    return { limited: true, reason: 'unavailable' }
  }
}
