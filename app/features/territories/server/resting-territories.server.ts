import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getRestPeriodCutoffs } from '~/features/territories/model/resting-periods'

export async function countRestingTerritories(db: TransactionClient, congregationId: number) {
  const cutoffs = getRestPeriodCutoffs()

  return await db.territory.count({
    where: {
      congregationId,
      attributions: {
        // Exclude territories with an in-progress attribution so `resting`
        // is mutually exclusive with `working` — a territory with both an
        // open attribution AND a past attribution still inside its rest
        // window otherwise inflates the `État global` totals.
        none: { endDate: null },
        some: {
          OR: [
            { type: TerritoryAttributionKind.Default, endDate: { gt: cutoffs.doorsToDoors } },
            { type: TerritoryAttributionKind.Campaign, endDate: { gt: cutoffs.campaign } },
            { type: TerritoryAttributionKind.Phone, endDate: { gt: cutoffs.phone } },
          ],
        },
      },
    },
  })
}
