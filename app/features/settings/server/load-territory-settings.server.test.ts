import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { loadTerritorySettings } from './load-territory-settings.server'

const mockDb = { setting: { findMany: vi.fn() } }
// biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
const dbCast = mockDb as any

beforeEach(() => {
  vi.resetAllMocks()
})

describe('loadTerritorySettings', () => {
  it('threads congregationId into the where clause and filters on territory keys', async () => {
    mockDb.setting.findMany.mockResolvedValue([])

    await loadTerritorySettings(dbCast, 42)

    const call = mockDb.setting.findMany.mock.calls[0][0]
    expect(call.where.congregationId).toBe(42)
    expect(call.where.key.in).toContain(TerritorySettingKey.BanoUrl)
    expect(call.where.key.in).toContain(TerritorySettingKey.ProspectionValidity)
  })

  it('returns an empty object when no settings are stored', async () => {
    mockDb.setting.findMany.mockResolvedValue([])
    const result = await loadTerritorySettings(dbCast, 42)
    expect(result).toEqual({})
  })

  it('reshapes rows into a key -> value map keyed by TerritorySettingKey', async () => {
    mockDb.setting.findMany.mockResolvedValue([
      { key: TerritorySettingKey.BanoUrl, value: 'https://bano.example' },
      { key: TerritorySettingKey.ProspectionValidity, value: '30' },
    ])

    const result = await loadTerritorySettings(dbCast, 42)

    expect(result[TerritorySettingKey.BanoUrl]).toBe('https://bano.example')
    expect(result[TerritorySettingKey.ProspectionValidity]).toBe('30')
  })

  it('coerces a null value into an undefined entry (not a null one)', async () => {
    mockDb.setting.findMany.mockResolvedValue([{ key: TerritorySettingKey.BanoUrl, value: null }])
    const result = await loadTerritorySettings(dbCast, 42)
    expect(result[TerritorySettingKey.BanoUrl]).toBeUndefined()
  })
})
