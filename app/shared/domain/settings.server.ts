import type { TransactionClient } from '~/shared/infra/db.server'
import type { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import type { TerritorySettingKey } from '~/shared/types/territory-setting-key'

type SettingKey = TerritorySettingKey | CongregationSettingKey

export async function getSetting(
  db: TransactionClient,
  key: SettingKey,
  congregationId: number,
): Promise<string | undefined> {
  const setting = await db.setting.findFirst({ where: { key, congregationId } })

  return setting?.value
}

export async function getBoolSetting(
  db: TransactionClient,
  key: SettingKey,
  congregationId: number,
): Promise<boolean | undefined> {
  const settingValue = await getSetting(db, key, congregationId)

  return settingValue === 'true'
}

export async function setSetting(db: TransactionClient, key: SettingKey, value: string, congregationId: number) {
  if (key == null || value.length < 1) {
    return
  }

  const existing = await db.setting.findFirst({ where: { key, congregationId } })

  if (existing) {
    await db.setting.update({
      where: { id_congregationId: { id: existing.id, congregationId } },
      data: { value },
    })
  } else {
    await db.setting.create({
      data: {
        key,
        value,
        congregationId,
      },
    })
  }
}
