import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TransactionClient } from '~/shared/infra/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

vi.mock('~/shared/domain/settings.server', () => ({ setSetting: vi.fn(), clearSetting: vi.fn() }))
vi.mock('~/features/territories/index.server', () => ({ setKindAllowedRoles: vi.fn() }))
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { TerritorySettingsUpdated: 'territory.settings.updated' },
  audit: vi.fn(),
}))

const { setSetting, clearSetting } = await import('~/shared/domain/settings.server')
const { setKindAllowedRoles } = await import('~/features/territories/index.server')
const { audit } = await import('~/shared/domain/audit.server')
const { updateTerritorySettings } = await import('./territory-settings.server')

const db = {} as TransactionClient

const INPUT = {
  zips: ['75011', '75020'],
  banoUrl: 'https://bano.example.org/bano-75.csv',
  prospectionValidity: 24,
  phoneActive: true,
  mapTabActive: false,
  pmrActive: true,
  durations: { default: 120, commerce: 180, phone: 60 },
  kindRoles: { Classical: [], Univ: [4], Commerces: [], Phone: [7, 8], Hotel: [] },
}

const written = () => Object.fromEntries(vi.mocked(setSetting).mock.calls.map(([, key, value]) => [key, value]))

beforeEach(() => vi.resetAllMocks())

describe('updateTerritorySettings', () => {
  it('writes each setting under its key', async () => {
    await updateTerritorySettings(db, 3, 9, INPUT)

    expect(written()).toEqual({
      [TerritorySettingKey.TerritoryZipCodes]: '["75011","75020"]',
      [TerritorySettingKey.BanoUrl]: INPUT.banoUrl,
      [TerritorySettingKey.ProspectionValidity]: '24',
      [TerritorySettingKey.TerritoryTypePhoneActive]: 'true',
      [TerritorySettingKey.MapTabActive]: 'false',
      [TerritorySettingKey.PmrActive]: 'true',
      [TerritorySettingKey.AttributionDefaultDurationDays]: '120',
      [TerritorySettingKey.AttributionCommerceDurationDays]: '180',
      [TerritorySettingKey.AttributionPhoneDurationDays]: '60',
    })
  })

  it('stops the address synchronisation when the BANO file is emptied', async () => {
    await updateTerritorySettings(db, 3, 9, { ...INPUT, banoUrl: '' })

    expect(clearSetting).toHaveBeenCalledWith(db, TerritorySettingKey.BanoUrl, 3)
    expect(written()).not.toHaveProperty(TerritorySettingKey.BanoUrl)
  })

  it('saves the roles of each territory kind', async () => {
    await updateTerritorySettings(db, 3, 9, INPUT)

    expect(setKindAllowedRoles).toHaveBeenCalledWith(db, 'Phone', [7, 8], 3, 9)
    expect(setKindAllowedRoles).toHaveBeenCalledWith(db, 'Classical', [], 3, 9)
    expect(setKindAllowedRoles).toHaveBeenCalledTimes(5)
  })

  it('leaves one line in the audit log', async () => {
    await updateTerritorySettings(db, 3, 9, INPUT)

    expect(audit).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'territory.settings.updated', congregationId: 3, actorId: 9 }),
    )
  })

  it('saves no empty postal code when the last one is removed', async () => {
    await updateTerritorySettings(db, 3, 9, { ...INPUT, zips: [''] })

    expect(written()[TerritorySettingKey.TerritoryZipCodes]).toBe('[]')
  })
})
