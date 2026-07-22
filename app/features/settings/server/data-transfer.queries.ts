import type { Job } from 'bullmq'
import { createLogger } from '~/shared/infra/logger.server'
import { type DataTransferJobData, dataTransferQueue } from './data-transfer-queue.server'

const logger = createLogger('data-transfer')

/**
 * Fetches a data-transfer job by id, but only when it belongs to the given
 * congregation and matches the expected transfer type.
 *
 * `dataTransferQueue` is a single global queue shared by every congregation, so
 * `getJob(id)` returns any tenant's job regardless of the caller. Job ids are
 * random UUIDs at enqueue time (see the export/import actions), which makes a
 * cross-tenant id hard to guess — but the id is never the authorization
 * boundary; this ownership + type check is. A cross-tenant or wrong-type id
 * resolves to `null`, letting routes redirect exactly as they already do for a
 * missing job. A cross-tenant hit is logged as a probe first, so support can
 * spot enumeration attempts.
 */
export async function getOwnedDataTransferJob(
  jobId: string,
  congregationId: number,
  actorId: number,
  type: DataTransferJobData['type'],
): Promise<Job<DataTransferJobData> | null> {
  const job = await dataTransferQueue.getJob(jobId)
  const data = job?.data as DataTransferJobData | undefined
  if (!job || !data) {
    return null
  }

  if (data.congregationId !== congregationId) {
    // The job exists but belongs to another congregation — an authenticated
    // admin supplied a foreign job id. Distinct from the benign not-found and
    // wrong-type cases below, this is a cross-tenant probe worth recording
    // (mirrors the manager-path logging in events-auth.server.ts).
    logger.warn('getOwnedDataTransferJob: cross-tenant job access attempt', {
      jobId,
      actorId,
      requestedByCongregation: congregationId,
      ownerCongregation: data.congregationId,
    })
    return null
  }

  if (data.type !== type) {
    return null
  }

  return job as Job<DataTransferJobData>
}
