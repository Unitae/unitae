import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/settings.server', () => ({
  getBoolSetting: vi.fn(),
}))

const { getPhoneTerritoryActive } = await import('./territory-settings.queries')
const { getBoolSetting } = await import('~/shared/domain/settings.server')

const mockDb = {} as never

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getPhoneTerritoryActive', () => {
  it('returns true when the setting is stored as "true"', async () => {
    vi.mocked(getBoolSetting).mockResolvedValue(true)

    await expect(getPhoneTerritoryActive(mockDb, 42)).resolves.toBe(true)
    expect(getBoolSetting).toHaveBeenCalledWith(mockDb, 'phone-territory-active', 42)
  })

  it('returns false when the setting is stored as "false"', async () => {
    vi.mocked(getBoolSetting).mockResolvedValue(false)

    await expect(getPhoneTerritoryActive(mockDb, 42)).resolves.toBe(false)
  })

  it('defaults to false when the setting row is missing', async () => {
    vi.mocked(getBoolSetting).mockResolvedValue(undefined)

    await expect(getPhoneTerritoryActive(mockDb, 42)).resolves.toBe(false)
  })
})
