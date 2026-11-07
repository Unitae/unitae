import type { TransactionClient } from '~/shared/infra/db.server'
import { combineLocalDateTime } from '~/shared/utils/event-time'
import { zonedNow } from '~/shared/utils/zoned-now'

/** Territories out and late at the end of each of the last twelve months, oldest first; the last point is now. */
export interface TerritoryTrend {
  out: number[]
  late: number[]
  /** The same two counts thirty days ago, for the « en un mois » line. */
  monthAgo: TerritoryCounts
}

interface TerritoryCounts {
  out: number
  late: number
}

interface TrendAttribution {
  startDate: Date
  endDate: Date | null
  lateDate: Date
  pausedAt: Date | null
}

const TREND_MONTHS = 12
const MONTH_AGO_MS = 30 * 86_400_000

const firstOfMonth = (absolute: number) =>
  `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}-01`

/**
 * When each point is read: the first moment of the following month on the congregation clock
 * for each past month, then now for the current one.
 */
export function trendSnapshots(timezone: string, now: Date, months = TREND_MONTHS): Date[] {
  const today = zonedNow(timezone, now)
  const current = today.getFullYear() * 12 + today.getMonth()
  const past = Array.from({ length: months - 1 }, (_, index) =>
    combineLocalDateTime(firstOfMonth(current - (months - 2) + index), '00:00', timezone),
  )
  return [...past, now]
}

/**
 * Out between its start and its return. Late past its due date, except while a campaign holds it:
 * a paused clock is frozen. Resuming pushes the due date back by the pause, and the original date
 * is not kept, so a territory paused while already late reads as on time before its pause.
 */
function countAt(attributions: TrendAttribution[], at: Date): TerritoryCounts {
  let out = 0
  let late = 0
  for (const attribution of attributions) {
    if (attribution.startDate > at || (attribution.endDate != null && attribution.endDate <= at)) continue
    out++
    const paused = attribution.pausedAt != null && attribution.pausedAt <= at
    if (!paused && attribution.lateDate < at) late++
  }
  return { out, late }
}

export function summarizeTerritoryTrend(
  attributions: TrendAttribution[],
  snapshots: Date[],
  monthAgo: Date,
): TerritoryTrend {
  const points = snapshots.map(at => countAt(attributions, at))
  return {
    out: points.map(point => point.out),
    late: points.map(point => point.late),
    monthAgo: countAt(attributions, monthAgo),
  }
}

export async function getTerritoryTrend(
  db: TransactionClient,
  congregationId: number,
  timezone: string,
  now: Date = new Date(),
): Promise<TerritoryTrend> {
  const snapshots = trendSnapshots(timezone, now)
  // Every attribution still out at the first point, or taken since: the month-ago point is later.
  const attributions = await db.attribution.findMany({
    where: { congregationId, startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gt: snapshots[0] } }] },
    select: { startDate: true, endDate: true, lateDate: true, pausedAt: true },
  })
  return summarizeTerritoryTrend(attributions, snapshots, new Date(now.getTime() - MONTH_AGO_MS))
}
