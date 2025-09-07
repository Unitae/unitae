import http from 'node:http'
import { Worker } from 'bullmq'
import { handleSyncWork } from '~/features/territories/server/handle-sync-work.server'
import { createLogger } from '~/shared/libs/logger.server'
import { redis } from '~/shared/libs/redis.server'

const logger = createLogger('sync-worker')
const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? '9090')

let isReady = false

export const syncWorker = new Worker('syncQueue', handleSyncWork, {
  connection: redis,
  concurrency: 1,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
})

syncWorker.on('ready', () => {
  isReady = true
  logger.info('Sync worker is ready and waiting for jobs')
})

syncWorker.on('error', err => {
  logger.error('Worker error', { error: err.message })
})

syncWorker.on('completed', job => {
  logger.info(`Job ${job.id} completed successfully`, {
    jobData: job.data,
  })
})

syncWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed`, {
    error: err.message,
    jobData: job?.data,
    attemptsMade: job?.attemptsMade,
  })
})

// Health check HTTP server for K8s probes
const healthServer = http.createServer((_req, res) => {
  if (isReady && !syncWorker.closing) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('OK')
  } else {
    res.writeHead(503, { 'Content-Type': 'text/plain' })
    res.end('Not Ready')
  }
})

healthServer.listen(HEALTH_PORT, () => {
  logger.info(`Worker health server listening on port ${HEALTH_PORT}`)
})

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down worker...`)
  try {
    healthServer.close()
    await syncWorker.close()
    logger.info('Worker shutdown complete')
    process.exit(0)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Error during worker shutdown', { error: errorMessage })
    process.exit(1)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

logger.info('Sync worker started')
