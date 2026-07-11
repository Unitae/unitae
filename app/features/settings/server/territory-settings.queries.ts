import { getBoolSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

/**
 * Whether the congregation has enabled the Phone territory kind.
 *
 * Missing setting is treated as `false` — a fresh congregation that never
 * touched the toggle behaves as if Phone territories are disabled. That's
 * intentional: opting into a whole territory kind should be an explicit act.
 * `getBoolSetting` already returns `false` for missing/non-"true" values;
 * the `?? false` below is a belt-and-braces guard against a future signature
 * loosening.
 */
export async function getPhoneTerritoryActive(db: TransactionClient, congregationId: number): Promise<boolean> {
  const value = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)
  return value ?? false
}
