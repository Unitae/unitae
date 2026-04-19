import Redis from 'ioredis'
import logger from './logger.server'

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  connectTimeout: 10000,
  lazyConnect: true,
}

export const redis = new Redis({
  ...redisConfig,
  maxRetriesPerRequest: null, // Allow retries for BullMQ
  commandTimeout: 60000, // Increase timeout for BullMQ operations
})

redis.on('error', error => {
  logger.error('Redis connection error', { error: error.message })
})

redis.on('connect', () => {
  logger.info('Connected to Redis')
})

// Separate client for rate limiting with fast failure (2s timeout)
export const redisRateLimit = new Redis({
  ...redisConfig,
  maxRetriesPerRequest: 0,
  commandTimeout: 2000,
})

redisRateLimit.on('error', error => {
  logger.error('Redis rate-limit connection error', { error: error.message })
})
