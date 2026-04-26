import { getSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

const DEFAULT_ATTRIBUTION_DURATION_MONTHS = 4

export interface CreateAttributionParams {
  publisherId: number
  territoryId: number
  startDate: string
  notes: string
  type: string
  congregationId: number
}

export async function createAttribution(db: TransactionClient, params: CreateAttributionParams) {
  const durationSetting = await getSetting(
    db,
    TerritorySettingKey.AttributionDefaultDurationMonths,
    params.congregationId,
  )
  const parsed = durationSetting ? Number(durationSetting) : Number.NaN
  const durationMonths = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ATTRIBUTION_DURATION_MONTHS

  const lateDate = new Date(params.startDate)
  lateDate.setMonth(lateDate.getMonth() + durationMonths)

  return db.attribution.create({
    data: {
      publisherId: params.publisherId,
      territoryId: params.territoryId,
      notes: params.notes,
      type: params.type,
      startDate: new Date(params.startDate),
      lateDate,
      congregationId: params.congregationId,
    },
  })
}
