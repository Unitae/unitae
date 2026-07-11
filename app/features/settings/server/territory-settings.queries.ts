import { getBoolSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

export async function getPhoneTerritoryActive(db: TransactionClient, congregationId: number): Promise<boolean> {
  const value = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)
  return value ?? false
}
