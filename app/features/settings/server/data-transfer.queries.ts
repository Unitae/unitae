import type { Job } from 'bullmq'
import { type DataTransferJobData, dataTransferQueue } from './data-transfer-queue.server'

/**
 * Fetches a data-transfer job by id, but only when it belongs to the given
 * congregation and matches the expected transfer type.
 *
 * `dataTransferQueue` is a single global queue shared by every congregation and
 * job ids are trivially guessable, so callers must never trust the id alone — a
 * cross-tenant or wrong-type id resolves to `null`, letting routes redirect
 * exactly as they already do for a missing job.
 */
export async function getOwnedDataTransferJob(
  jobId: string,
  congregationId: number,
  type: DataTransferJobData['type'],
): Promise<Job<DataTransferJobData> | null> {
  const job = await dataTransferQueue.getJob(jobId)
  const data = job?.data as DataTransferJobData | undefined
  if (!job || !data || data.type !== type || data.congregationId !== congregationId) {
    return null
  }
  return job as Job<DataTransferJobData>
}
