import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { db } from '~/shared/libs/db.server'
import {
  RESTING_PERIOD_FOR_CAMPAIGN,
  RESTING_PERIOD_FOR_DOORS_TO_DOORS,
  RESTING_PERIOD_FOR_PHONE,
} from './resting-periods.server'

export async function countRestingTerritories() {
  const endRestPeriodForDoorsToDoors = new Date()
  const endRestPeriodForCampaign = new Date()
  const endRestPeriodForPhone = new Date()

  endRestPeriodForDoorsToDoors.setTime(endRestPeriodForDoorsToDoors.getTime() - RESTING_PERIOD_FOR_DOORS_TO_DOORS)
  endRestPeriodForCampaign.setTime(endRestPeriodForCampaign.getTime() - RESTING_PERIOD_FOR_CAMPAIGN)
  endRestPeriodForPhone.setTime(endRestPeriodForPhone.getTime() - RESTING_PERIOD_FOR_PHONE)

  return await db.territory.count({
    where: {
      attributions: {
        some: {
          // biome-ignore lint/style/useNamingConvention: Prisma does not support snake_case
          OR: [
            {
              type: TerritoryAttributionKind.Default,
              endDate: {
                gt: endRestPeriodForDoorsToDoors,
              },
            },
            {
              type: TerritoryAttributionKind.Campaign,
              endDate: {
                gt: endRestPeriodForCampaign,
              },
            },
            {
              type: TerritoryAttributionKind.Phone,
              endDate: {
                gt: endRestPeriodForPhone,
              },
            },
          ],
        },
      },
    },
  })
}
