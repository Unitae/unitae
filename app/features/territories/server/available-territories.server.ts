import { getRestPeriodCutoffs } from '~/features/territories/model/resting-periods'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function countAvailableTerritories(db: TransactionClient, congregationId: number) {
  const cutoffs = getRestPeriodCutoffs()

  return await db.territory.count({
    where: {
      congregationId,
      attributions: {
        every: {
          // Campaign work rests on the campaign cutoff regardless of method;
          // the method cutoffs only apply to regular (non-campaign) work.
          OR: [
            {
              campaignId: { not: null },
              endDate: {
                lt: cutoffs.campaign,
                not: null,
              },
            },
            {
              campaignId: null,
              type: TerritoryAttributionKind.Default,
              endDate: {
                lt: cutoffs.doorsToDoors,
                not: null,
              },
            },
            {
              campaignId: null,
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
