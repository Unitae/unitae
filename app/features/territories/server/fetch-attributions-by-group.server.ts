import type { TransactionClient } from '~/shared/libs/db.server'

export interface AttributionsByGroup {
  groupName: string
  count: number
}

// Compte les attributions actives (en cours) regroupées par groupe de prédication
export async function fetchActiveAttributionsByGroup(db: TransactionClient): Promise<AttributionsByGroup[]> {
  const attributions = await db.attribution.findMany({
    where: { endDate: null },
    select: {
      publisher: {
        select: {
          publisherGroup: {
            select: { name: true },
          },
        },
      },
    },
  })

  const countByGroup = new Map<string, number>()

  for (const a of attributions) {
    const groupName = a.publisher.publisherGroup?.name ?? 'Sans groupe'
    countByGroup.set(groupName, (countByGroup.get(groupName) ?? 0) + 1)
  }

  return Array.from(countByGroup.entries())
    .map(([groupName, count]) => ({ groupName, count }))
    .sort((a, b) => b.count - a.count)
}
