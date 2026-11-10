import type { Job } from 'bullmq'
import { notify } from '~/features/notifications/index.server'
import { withScope } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { BuildingSyncError, BuildingSyncStatus } from '../model/building-sync.type'
import {
  completeBuildingSync,
  failBuildingSync,
  recordBuildingSyncProgress,
  saveSyncedAddresses,
  startBuildingSync,
} from '../server/building-sync.server'
import { getPerimeterPaths } from '../server/perimeter.server'
import { type OpenDataAddress, OpenDataSourceError, readOpenDataAddresses } from '../server/read-open-data.server'
import { getAllowedZips } from '../server/settings.server'
import type { SyncJobData } from '../server/sync-queue.server'

const logger = createLogger('sync-worker')

// Small enough that each batch commits in well under a second; the whole file never sits in
// one transaction (the default transaction timeout is 5 s, a département takes minutes).
const BATCH_SIZE = 250
const BATCH_TIMEOUT_MS = 60_000
// Download is the first half of the progress bar, saving the second.
const DOWNLOAD_SHARE = 50
const PROGRESS_STEP = 5

class NoMatchingAddressError extends Error {}

/**
 * Runs one address sync: reads the whole BANO file first, outside any transaction, then saves
 * its addresses in short batches and closes the run. A failure at any point closes the run as
 * failed with a reason; the buildings keep what earlier batches wrote and nothing is reset, so
 * running it again finishes the job.
 */
export async function handleSyncWork(job: Job<SyncJobData>): Promise<void> {
  const { userId, congregationId } = job.data
  const runId = job.data.runId ?? (await startLegacyRun(congregationId, userId))
  if (runId == null) return

  const context = await withScope(congregationId, async db => ({
    run: await db.buildingSync.findFirst({ where: { id: runId, congregationId } }),
    zips: await getAllowedZips(db),
    perimeter: await getPerimeterPaths(db),
  }))
  // A job replayed after its run ended (a stalled job, a worker restart) has nothing left to do.
  if (context.run?.status !== BuildingSyncStatus.Running) return
  const run = context.run

  const progress = progressWriter(job, runId, congregationId)
  try {
    logger.info(`Sync ${runId} reading ${run.sourceUrl}`, { congregationId })
    const addresses = await readOpenDataAddresses(run.sourceUrl, context.zips, {
      onProgress: percent => progress.report((percent * DOWNLOAD_SHARE) / 100),
    })
    if (addresses.length === 0) throw new NoMatchingAddressError()

    const perimeter = context.perimeter?.map(p => [p.lat, p.lng] as [number, number]) ?? null
    for (const [index, batch] of batches(addresses).entries()) {
      await withScope(
        congregationId,
        db => saveSyncedAddresses(db, { congregationId, runStartedAt: run.startedAt, addresses: batch, perimeter }),
        { timeout: BATCH_TIMEOUT_MS },
      )
      const saved = Math.min(addresses.length, (index + 1) * BATCH_SIZE)
      progress.report(DOWNLOAD_SHARE + ((100 - DOWNLOAD_SHARE) * saved) / addresses.length)
    }
    await progress.settled()

    const counts = await withScope(
      congregationId,
      async db => {
        const done = await completeBuildingSync(db, { runId, congregationId })
        await notify(db, {
          type: 'territory.sync.completed',
          entityType: 'Congregation',
          entityId: congregationId,
          congregationId,
          recipientId: userId,
          actorId: userId,
          payload: { created: done.createdCount, missing: done.missingCount },
        })
        return done
      },
      { timeout: BATCH_TIMEOUT_MS },
    )
    await job.updateProgress(100)
    logger.info(`Sync ${runId} completed`, { congregationId, ...counts })
  } catch (error) {
    await progress.settled()
    const reason = failureReason(error)
    logger.error(`Sync ${runId} failed`, { congregationId, reason, error })
    await withScope(congregationId, async db => {
      await failBuildingSync(db, { runId, congregationId, error: reason })
      await notify(db, {
        type: 'territory.sync.failed',
        entityType: 'Congregation',
        entityId: congregationId,
        congregationId,
        recipientId: userId,
        actorId: userId,
        payload: { reason },
      })
    }).catch(closeError => logger.error(`Sync ${runId} could not be closed as failed`, { error: closeError }))
    throw error
  }
}

/** Jobs queued before runs were recorded carry no run: open one for them. */
async function startLegacyRun(congregationId: number, userId: number): Promise<number | null> {
  try {
    const run = await withScope(congregationId, db => startBuildingSync(db, { congregationId, actorId: userId }))
    return run.id
  } catch (error) {
    logger.warn('Legacy sync job skipped', { congregationId, error })
    return null
  }
}

function batches(addresses: OpenDataAddress[]): OpenDataAddress[][] {
  const out: OpenDataAddress[][] = []
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) out.push(addresses.slice(i, i + BATCH_SIZE))
  return out
}

/**
 * Writes progress to the run (what the page shows) and to the job, one write at a time and only
 * every few points. Writes are chained and their errors logged, never left unhandled: a progress
 * write must not take the worker down.
 */
function progressWriter(job: Job<SyncJobData>, runId: number, congregationId: number) {
  let last = 0
  let chain: Promise<void> = Promise.resolve()
  return {
    report(raw: number) {
      const value = Math.min(99, Math.floor(raw))
      if (value < last + PROGRESS_STEP) return
      last = value
      chain = chain
        .then(async () => {
          await withScope(congregationId, db =>
            recordBuildingSyncProgress(db, { runId, congregationId, progress: value }),
          )
          await job.updateProgress(value)
        })
        .catch(error => {
          logger.warn(`Sync ${runId} progress not saved`, { error })
        })
    },
    settled: () => chain,
  }
}

function failureReason(error: unknown): BuildingSyncError {
  if (error instanceof NoMatchingAddressError) return BuildingSyncError.NoMatchingAddress
  if (error instanceof OpenDataSourceError) {
    return {
      unreachable: BuildingSyncError.SourceUnreachable,
      refused: BuildingSyncError.SourceRefused,
      'too-large': BuildingSyncError.SourceTooLarge,
      unreadable: BuildingSyncError.SourceUnreadable,
    }[error.code]
  }
  return BuildingSyncError.Unknown
}
