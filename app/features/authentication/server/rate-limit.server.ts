import logger from '~/shared/libs/logger.server'
import { redisRateLimit as redis } from '~/shared/libs/redis.server'

const MAX_LOGIN_ATTEMPTS = 5
const MAX_PASSWORD_RESET_ATTEMPTS = 3
const WINDOW_SECONDS = 15 * 60 // 15 minutes

export async function checkLoginRateLimit(email: string): Promise<boolean> {
  const key = `login_attempts:${email.toLowerCase()}`

  try {
    const attempts = await redis.get(key)
    return Number(attempts ?? 0) < MAX_LOGIN_ATTEMPTS
  } catch (error) {
    logger.warn('Rate limit check failed, allowing request', { error })
    return true
  }
}

export async function recordLoginAttempt(email: string): Promise<void> {
  const key = `login_attempts:${email.toLowerCase()}`

  try {
    const current = await redis.incr(key)
    if (current === 1) {
      await redis.expire(key, WINDOW_SECONDS)
    }
  } catch (error) {
    logger.warn('Failed to record login attempt', { error })
  }
}

export async function clearLoginAttempts(email: string): Promise<void> {
  const key = `login_attempts:${email.toLowerCase()}`

  try {
    await redis.del(key)
  } catch (error) {
    logger.warn('Failed to clear login attempts', { error })
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
