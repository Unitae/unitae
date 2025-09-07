import type { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import type { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { db } from '~/shared/libs/db.server'

type SettingKey = TerritorySettingKey | CongregationSettingKey

export async function getSetting(key: SettingKey): Promise<string | undefined> {
  const setting = await db.setting.findFirst({ where: { key } })

  return setting?.value
}

export async function getBoolSetting(key: SettingKey): Promise<boolean | undefined> {
  const settingValue = await getSetting(key)

  return settingValue === 'true'
}

export async function setSetting(key: SettingKey, value: string) {
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
        congregationId: 0 as number,
      },
    })
  }
}
