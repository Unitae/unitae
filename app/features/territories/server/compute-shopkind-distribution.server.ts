import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'

const TOP_N = 8

export interface ShopKindDistributionEntry {
  name: string
  count: number
}

interface Bucket {
  name: string
  count: number
  winnerCount: number
}

export async function computeShopKindDistribution(
  db: TransactionClient,
  congregationId: number,
  otherLabel: string,
): Promise<ShopKindDistributionEntry[]> {
  const rows = await db.buildingEntrance.groupBy({
    by: ['shopKind'],
    where: { congregationId, kind: EntranceKind.Commerce },
    _count: { _all: true },
  })

  const buckets = new Map<string, Bucket>()
  for (const row of rows) {
    const key = row.shopKind.trim().toLowerCase()
    if (key === '') continue

    const rowCount = row._count._all
    const existing = buckets.get(key)
    if (existing == null) {
      buckets.set(key, { name: row.shopKind, count: rowCount, winnerCount: rowCount })
      continue
    }

    existing.count += rowCount
    if (rowCount > existing.winnerCount) {
      existing.name = row.shopKind
      existing.winnerCount = rowCount
    }
  }

  const sorted: ShopKindDistributionEntry[] = Array.from(buckets.values())
    .map(({ name, count }) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  if (sorted.length <= TOP_N) return sorted

  const top = sorted.slice(0, TOP_N)
  const tailCount = sorted.slice(TOP_N).reduce((sum, entry) => sum + entry.count, 0)

  return [...top, { name: otherLabel, count: tailCount }]
}
