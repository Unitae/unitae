import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getRestPeriodCutoffs } from './resting-periods.server'

export async function countAvailableTerritories(db: TransactionClient, congregationId: number) {
  const cutoffs = getRestPeriodCutoffs()

  return await db.territory.count({
    where: {
      congregationId,
      attributions: {
        every: {
          OR: [
            {
              type: TerritoryAttributionKind.Default,
              endDate: {
                lt: cutoffs.doorsToDoors,
                not: null,
              },
            },
            {
              type: TerritoryAttributionKind.Campaign,
              endDate: {
                lt: cutoffs.campaign,
                not: null,
              },
            },
            {
              type: TerritoryAttributionKind.Phone,
              endDate: {
                lt: cutoffs.phone,
                not: null,
              },
            },
          ],
        },
      },
    },
  })
}
