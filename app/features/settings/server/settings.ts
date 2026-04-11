import type { TransactionClient } from '~/shared/libs/db.server'
import type { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import type { TerritorySettingKey } from '~/shared/types/territory-setting-key'

type SettingKey = TerritorySettingKey | CongregationSettingKey

export async function getSetting(db: TransactionClient, key: SettingKey): Promise<string | undefined> {
  const setting = await db.setting.findFirst({ where: { key } })

  return setting?.value
}

export async function getBoolSetting(db: TransactionClient, key: SettingKey): Promise<boolean | undefined> {
  const settingValue = await getSetting(db, key)

  return settingValue === 'true'
}

export async function setSetting(db: TransactionClient, key: SettingKey, value: string, congregationId: number) {
  if (key == null || value.length < 1) {
    return
  }

  const existing = await db.setting.findFirst({ where: { key } })

  if (existing) {
    await db.setting.update({
      where: { id: existing.id },
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
