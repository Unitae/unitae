import * as m from '~/i18n/paraglide/messages'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface AttributionsByGroup {
  groupName: string
  count: number
}

// Compte les attributions actives (en cours) regroupées par groupe de prédication
export async function fetchActiveAttributionsByGroup(
  db: TransactionClient,
  congregationId: number,
): Promise<AttributionsByGroup[]> {
  const attributions = await db.attribution.findMany({
    where: { endDate: null, congregationId },
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
  const noGroupLabel = m.publishers_no_group()

  for (const a of attributions) {
    const groupName = a.publisher.publisherGroup?.name ?? noGroupLabel
    countByGroup.set(groupName, (countByGroup.get(groupName) ?? 0) + 1)
  }

  return Array.from(countByGroup.entries())
    .map(([groupName, count]) => ({ groupName, count }))
    .sort((a, b) => b.count - a.count)
}
