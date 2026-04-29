import type { Job } from 'bullmq'
import { createLogger } from '~/shared/infra/logger.server'
import type { DataTransferJobData } from '../server/data-transfer-queue.server'
import { runExport } from '../server/export-congregation.server'
import { runImport } from '../server/import-congregation.server'

const logger = createLogger('data-transfer-worker')

export async function handleDataTransferWork(job: Job<DataTransferJobData>): Promise<string | void> {
  logger.info(`Starting data transfer job ${job.id}`, { type: job.data.type, congregationId: job.data.congregationId })

  switch (job.data.type) {
    case 'export':
      return runExport(job as Job<Extract<DataTransferJobData, { type: 'export' }>>)
    case 'import':
      return runImport(job as Job<Extract<DataTransferJobData, { type: 'import' }>>)
  }
}
