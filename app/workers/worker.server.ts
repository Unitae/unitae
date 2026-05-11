import '~/shared/utils/worker-locale.server'

import http from 'node:http'
import { Worker } from 'bullmq'
import { handleThumbnailWork } from '~/features/display-board/jobs/handle-thumbnail-work.server'
import { handleEmailWork } from '~/features/notifications/jobs/handle-email-work.server'
import { handleDataTransferWork } from '~/features/settings/jobs/handle-data-transfer-work.server'
import { handleSyncWork } from '~/features/territories/jobs/handle-sync-work.server'
import { createLogger } from '~/shared/infra/logger.server'
import { QUEUE_NAMES } from '~/shared/infra/queues.server'
import { getBullMQConnection } from '~/shared/infra/redis.server'

const logger = createLogger('worker')
const HEALTH_PORT = Number(process.env.UNITAE_WORKER_HEALTH_PORT ?? '9090')

const readyWorkers = new Set<string>()

function setupWorkerEvents(worker: Worker, name: string) {
  worker.on('ready', () => {
    readyWorkers.add(name)
    logger.info(`[${name}] Worker is ready and waiting for jobs`)
  })

  worker.on('error', err => {
    logger.error(`[${name}] Worker error`, { error: err.message })
  })

  worker.on('completed', job => {
    logger.info(`[${name}] Job ${job.id} completed successfully`, { jobData: job.data })
  })

  worker.on('failed', (job, err) => {
    logger.error(`[${name}] Job ${job?.id} failed`, {
      error: err.message,
      jobData: job?.data,
      attemptsMade: job?.attemptsMade,
    })
  })
}

const syncWorker = new Worker(QUEUE_NAMES.sync, handleSyncWork, {
  connection: getBullMQConnection(),
  concurrency: 1,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
})

const emailWorker = new Worker(QUEUE_NAMES.email, handleEmailWork, {
  connection: getBullMQConnection(),
  concurrency: 5,
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 20 },
})

const thumbnailWorker = new Worker(QUEUE_NAMES.thumbnail, handleThumbnailWork, {
  connection: getBullMQConnection(),
  concurrency: 2,
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 20 },
})

const dataTransferWorker = new Worker(QUEUE_NAMES.dataTransfer, handleDataTransferWork, {
  connection: getBullMQConnection(),
  concurrency: 1,
  removeOnComplete: { count: 10 },
  removeOnFail: { count: 10 },
})

const workers = [syncWorker, emailWorker, thumbnailWorker, dataTransferWorker]
const workerNames = [QUEUE_NAMES.sync, QUEUE_NAMES.email, QUEUE_NAMES.thumbnail, QUEUE_NAMES.dataTransfer]

for (let i = 0; i < workers.length; i++) {
  setupWorkerEvents(workers[i], workerNames[i])
}

// Health check HTTP server for K8s probes
const healthServer = http.createServer((_req, res) => {
  const allReady = readyWorkers.size === workers.length
  const noneClosing = workers.every(w => !w.closing)

  if (allReady && noneClosing) {
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
  logger.info(`Received ${signal}, shutting down workers...`)
  try {
    healthServer.close()
    await Promise.allSettled(workers.map(w => w.close()))
    logger.info('All workers shutdown complete')
    process.exit(0)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Error during worker shutdown', { error: errorMessage })
    process.exit(1)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

logger.info('Workers started', { queues: Object.values(QUEUE_NAMES) })
