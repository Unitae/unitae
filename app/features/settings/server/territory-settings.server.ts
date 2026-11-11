import { TerritoryKindKey } from '~/features/territories'
import { setKindAllowedRoles } from '~/features/territories/index.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { clearSetting, setSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

export interface TerritorySettingsUpdate {
  zips: string[]
  /** The BANO file of the department; empty stops the address synchronisation. */
  banoUrl: string
  /** In months. */
  prospectionValidity: number
  phoneActive: boolean
  mapTabActive: boolean
  pmrActive: boolean
  /** In days, per kind of attribution. */
  durations: { default: number; commerce: number; phone: number }
  /** The roles allowed to receive each kind of territory; none means any publisher. */
  kindRoles: Record<TerritoryKindKey, number[]>
}

/** Saves the territory settings page, then leaves one line in the audit log. */
export async function updateTerritorySettings(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  input: TerritorySettingsUpdate,
) {
  const set = (key: TerritorySettingKey, value: string) => setSetting(db, key, value, congregationId)
  const zips = input.zips.filter(zip => zip !== '')

  await set(TerritorySettingKey.TerritoryZipCodes, JSON.stringify(zips))
  if (input.banoUrl === '') await clearSetting(db, TerritorySettingKey.BanoUrl, congregationId)
  else await set(TerritorySettingKey.BanoUrl, input.banoUrl)
  await set(TerritorySettingKey.ProspectionValidity, String(input.prospectionValidity))
  await set(TerritorySettingKey.TerritoryTypePhoneActive, String(input.phoneActive))
  await set(TerritorySettingKey.MapTabActive, String(input.mapTabActive))
  await set(TerritorySettingKey.PmrActive, String(input.pmrActive))
  await set(TerritorySettingKey.AttributionDefaultDurationDays, String(input.durations.default))
  await set(TerritorySettingKey.AttributionCommerceDurationDays, String(input.durations.commerce))
  await set(TerritorySettingKey.AttributionPhoneDurationDays, String(input.durations.phone))

  for (const key of Object.values(TerritoryKindKey)) {
    await setKindAllowedRoles(db, key, input.kindRoles[key], congregationId, actorId)
  }

  audit({
    action: AuditAction.TerritorySettingsUpdated,
    congregationId,
    actorId,
    metadata: {
      banoUrl: input.banoUrl || null,
      zips,
      prospectionValidity: input.prospectionValidity,
      durations: input.durations,
      phoneActive: input.phoneActive,
      mapTabActive: input.mapTabActive,
      pmrActive: input.pmrActive,
    },
  })
}
