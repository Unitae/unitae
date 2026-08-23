import '~/shared/infra/boot.server'
import '~/shared/utils/worker-locale.server'

import http from 'node:http'
import { Worker } from 'bullmq'
import { handleThumbnailWork } from '~/features/display-board/jobs/handle-thumbnail-work.server'
import { handleEmailWork } from '~/features/notifications/jobs/handle-email-work.server'
import { handleDataTransferWork } from '~/features/settings/jobs/handle-data-transfer-work.server'
import { handleRetentionWork } from '~/features/settings/jobs/handle-retention-work.server'
import { retentionQueue } from '~/features/settings/server/retention-queue.server'
import { handleCampaignLifecycleWork } from '~/features/territories/jobs/handle-campaign-lifecycle-work.server'
import { handleSyncWork } from '~/features/territories/jobs/handle-sync-work.server'
import { campaignQueue } from '~/features/territories/server/campaign-queue.server'
import { CAMPAIGN_CRON_HOUR_UTC, RETENTION_CRON_HOUR_UTC } from '~/shared/constants/limits'
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

const retentionWorker = new Worker(QUEUE_NAMES.retention, handleRetentionWork, {
  connection: getBullMQConnection(),
  concurrency: 1,
  removeOnComplete: { count: 30 },
  removeOnFail: { count: 30 },
})

const campaignWorker = new Worker(QUEUE_NAMES.campaign, handleCampaignLifecycleWork, {
  connection: getBullMQConnection(),
  concurrency: 1,
  removeOnComplete: { count: 30 },
  removeOnFail: { count: 30 },
})

// Daily retention cron — enqueue a repeating job at 03:00 UTC. BullMQ's
// `upsertJobScheduler` is idempotent, so the schedule survives restarts
// without piling up duplicate entries.
retentionQueue
  .upsertJobScheduler(
    'retention-daily',
    { pattern: `0 ${RETENTION_CRON_HOUR_UTC} * * *`, tz: 'UTC' },
    { name: 'retention-sweep', data: { triggeredAt: new Date().toISOString() } },
  )
  .catch(err => logger.error('Failed to register retention scheduler', { error: err.message }))

// Daily campaign lifecycle cron — 02:00 UTC, deliberately before the 03:00
// retention sweep so campaign transitions land first.
campaignQueue
  .upsertJobScheduler(
    'campaign-lifecycle-daily',
    { pattern: `0 ${CAMPAIGN_CRON_HOUR_UTC} * * *`, tz: 'UTC' },
    { name: 'campaign-lifecycle-sweep', data: { triggeredAt: new Date().toISOString() } },
  )
  .catch(err => logger.error('Failed to register campaign lifecycle scheduler', { error: err.message }))

// Catch-up pass on boot: a worker that was down over a campaign's start or end
// date converges immediately instead of waiting for the next 02:00 slot.
campaignQueue
  .add('campaign-lifecycle-sweep', { triggeredAt: new Date().toISOString() })
  .catch(err => logger.error('Failed to enqueue campaign lifecycle catch-up', { error: err.message }))

const workers = [syncWorker, emailWorker, thumbnailWorker, dataTransferWorker, retentionWorker, campaignWorker]
const workerNames = [
  QUEUE_NAMES.sync,
  QUEUE_NAMES.email,
  QUEUE_NAMES.thumbnail,
  QUEUE_NAMES.dataTransfer,
  QUEUE_NAMES.retention,
  QUEUE_NAMES.campaign,
]

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
