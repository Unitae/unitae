import logger from '~/shared/libs/logger.server'
import { redis } from '~/shared/libs/redis.server'

const MAX_ATTEMPTS = 5
const WINDOW_SECONDS = 15 * 60 // 15 minutes

export async function checkLoginRateLimit(email: string): Promise<boolean> {
  const key = `login_attempts:${email.toLowerCase()}`

  try {
    const attempts = await redis.get(key)
    return Number(attempts ?? 0) < MAX_ATTEMPTS
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
