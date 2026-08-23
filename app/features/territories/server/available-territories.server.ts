import { getCampaignRestCutoff, getRestPeriodCutoffs } from '~/features/territories/model/resting-periods'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function countAvailableTerritories(db: TransactionClient, congregationId: number) {
  const cutoffs = getRestPeriodCutoffs()

  // Each campaign rests its territories on its own window (restPeriodDays,
  // default 15 days); the method cutoffs only apply to regular work. Every
  // campaign attribution references a live campaign row (RESTRICT FK), so the
  // per-campaign branches cover the whole campaign layer.
  const campaigns = await db.campaign.findMany({
    where: { congregationId },
    select: { id: true, restPeriodDays: true },
  })

  return await db.territory.count({
    where: {
      congregationId,
      attributions: {
        every: {
          OR: [
            ...campaigns.map(campaign => ({
              campaignId: campaign.id,
              endDate: {
                lt: getCampaignRestCutoff(campaign.restPeriodDays),
                not: null,
              },
            })),
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
