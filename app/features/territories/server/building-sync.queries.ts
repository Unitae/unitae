import type { TransactionClient } from '~/shared/infra/db.server'
import { BuildingSyncStatus } from '../model/building-sync.type'

// A running sync writes its progress at least every few seconds. One silent for this long was
// cut off (worker restarted, job lost) and must not block the button any longer.
export const BUILDING_SYNC_STALE_AFTER_MS = 15 * 60_000

export function staleBefore(now: Date): Date {
  return new Date(now.getTime() - BUILDING_SYNC_STALE_AFTER_MS)
}

/** The sync currently going for the congregation, if one is and it is still alive. */
export function findRunningBuildingSync(db: TransactionClient, congregationId: number, now = new Date()) {
  return db.buildingSync.findFirst({
    where: { congregationId, status: BuildingSyncStatus.Running, updatedAt: { gte: staleBefore(now) } },
    orderBy: { startedAt: 'desc' },
  })
}
