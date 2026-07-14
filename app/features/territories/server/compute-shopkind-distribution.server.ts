import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { ShopKind, shopKindLabels } from '~/features/territories/model/shop-kind.type'
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

const KNOWN_SHOP_KIND_VALUES = new Set<string>(Object.values(ShopKind))

function resolveLabel(raw: string, labels: Record<ShopKind, string>): string {
  const trimmed = raw.trim()
  if (KNOWN_SHOP_KIND_VALUES.has(trimmed)) {
    return labels[trimmed as ShopKind]
  }
  return trimmed
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

  const labels = shopKindLabels()

  const buckets = new Map<string, Bucket>()
  for (const row of rows) {
    if (row.shopKind.trim() === '') continue

    const resolved = resolveLabel(row.shopKind, labels)
    const key = resolved.toLowerCase()
    const rowCount = row._count._all
    const existing = buckets.get(key)
    if (existing == null) {
      buckets.set(key, { name: resolved, count: rowCount, winnerCount: rowCount })
      continue
    }

    existing.count += rowCount
    if (rowCount > existing.winnerCount) {
      existing.name = resolved
      existing.winnerCount = rowCount
    }
  }

  // ShopKind.Other and the tail-bucket "other kinds" express the same idea:
  // "entries that don't warrant their own bar". Pull the enum's bucket out so
  // it always folds into the tail regardless of rank, avoiding two visually
  // identical bars on the chart.
  const otherEnumKey = labels[ShopKind.Other].toLowerCase()
  const otherEnumBucket = buckets.get(otherEnumKey)
  if (otherEnumBucket != null) buckets.delete(otherEnumKey)

  const sorted: ShopKindDistributionEntry[] = Array.from(buckets.values())
    .map(({ name, count }) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  if (sorted.length <= TOP_N) {
    if (otherEnumBucket != null) {
      sorted.push({ name: otherLabel, count: otherEnumBucket.count })
    }
    return sorted
  }

  const top = sorted.slice(0, TOP_N)
  const tailCount = sorted.slice(TOP_N).reduce((sum, entry) => sum + entry.count, 0) + (otherEnumBucket?.count ?? 0)

  return [...top, { name: otherLabel, count: tailCount }]
}
