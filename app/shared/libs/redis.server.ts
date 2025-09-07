import Redis from 'ioredis'
import logger from './logger.server'

export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Allow retries for BullMQ
  connectTimeout: 10000,
  commandTimeout: 60000, // Increase timeout for BullMQ operations
  lazyConnect: true,
})

redis.on('error', error => {
  logger.error('Redis connection error', { error: error.message })
})

redis.on('connect', () => {
  logger.info('Connected to Redis')
})
