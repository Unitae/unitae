import type { TransactionClient } from '~/shared/infra/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

const TERRITORY_SETTING_KEYS = [
  TerritorySettingKey.BanoUrl,
  TerritorySettingKey.ProspectionValidity,
  TerritorySettingKey.TerritoryTypePhoneActive,
  TerritorySettingKey.MapTabActive,
  TerritorySettingKey.AttributionDefaultDurationDays,
  TerritorySettingKey.AttributionCampaignDurationDays,
  TerritorySettingKey.AttributionPhoneDurationDays,
  TerritorySettingKey.AttributionCommerceDurationDays,
] as const

type TerritorySettingMap = Partial<Record<(typeof TERRITORY_SETTING_KEYS)[number], string>>

export async function loadTerritorySettings(db: TransactionClient, congregationId: number): Promise<TerritorySettingMap> {
  const rows = await db.setting.findMany({
    where: { congregationId, key: { in: TERRITORY_SETTING_KEYS as unknown as string[] } },
  })
  return Object.fromEntries(rows.map(r => [r.key, r.value ?? undefined])) as TerritorySettingMap
}
