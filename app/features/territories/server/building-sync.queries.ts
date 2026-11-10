import type { Prisma } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { accountDisplayName } from '~/shared/utils/display-name'
import { BuildingSyncError, BuildingSyncStatus } from '../model/building-sync.type'

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

const SUMMARY_SELECT = {
  id: true,
  status: true,
  progress: true,
  startedAt: true,
  finishedAt: true,
  createdCount: true,
  missingCount: true,
  error: true,
  updatedAt: true,
  startedBy: { select: { firstname: true, lastname: true, member: { select: { firstname: true, lastname: true } } } },
} satisfies Prisma.BuildingSyncSelect

/** A run as the prospection page tells it. */
export interface BuildingSyncSummary {
  id: number
  status: BuildingSyncStatus
  progress: number
  startedAt: Date
  finishedAt: Date | null
  createdCount: number | null
  missingCount: number | null
  error: BuildingSyncError | null
  /** Who started it; null once their account is gone. */
  startedBy: string | null
}

/**
 * The congregation's latest run (a running one gone silent reads as interrupted), and the last one that completed:
 * what the status line under the title and the « Synchroniser… » dialog say.
 */
export async function getBuildingSyncStatus(db: TransactionClient, congregationId: number, now = new Date()) {
  const [latest, lastCompleted] = await Promise.all([
    db.buildingSync.findFirst({ where: { congregationId }, orderBy: { startedAt: 'desc' }, select: SUMMARY_SELECT }),
    db.buildingSync.findFirst({
      where: { congregationId, status: BuildingSyncStatus.Completed },
      orderBy: { startedAt: 'desc' },
      select: SUMMARY_SELECT,
    }),
  ])
  return { latest: latest && summary(latest, now), lastCompleted: lastCompleted && summary(lastCompleted, now) }
}

type SelectedRun = Prisma.BuildingSyncGetPayload<{ select: typeof SUMMARY_SELECT }>

function summary({ updatedAt, startedBy, ...run }: SelectedRun, now: Date): BuildingSyncSummary {
  const interrupted = run.status === BuildingSyncStatus.Running && updatedAt < staleBefore(now)
  return {
    id: run.id,
    status: interrupted ? BuildingSyncStatus.Failed : run.status,
    progress: run.progress,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    createdCount: run.createdCount,
    missingCount: run.missingCount,
    error: interrupted ? BuildingSyncError.Interrupted : run.error,
    startedBy: startedBy ? accountDisplayName(startedBy) || null : null,
  }
}

/** Where a sync would read from and what it keeps: the congregation's territory settings. */
export async function getBuildingSyncFacts(db: TransactionClient, congregationId: number) {
  const settings = await db.setting.findMany({
    where: { congregationId, key: { in: ['bano-url', 'zips'] } },
    select: { key: true, value: true },
  })
  const value = (key: string) => settings.find(setting => setting.key === key)?.value ?? null
  const perimeter = await db.territoryPerimeter.findFirst({ where: { congregationId }, select: { id: true } })
  return { sourceUrl: value('bano-url') || null, zips: parseZips(value('zips')), perimeter: perimeter != null }
}

function parseZips(value: string | null): string[] {
  try {
    const parsed: unknown = value ? JSON.parse(value) : []
    // An emptied settings field saves `[""]`.
    return Array.isArray(parsed)
      ? parsed.filter((zip): zip is string => typeof zip === 'string' && zip.trim() !== '').sort()
      : []
  } catch {
    return []
  }
}
