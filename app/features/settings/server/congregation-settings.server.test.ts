import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  unscopedDb: {
    congregation: { update: vi.fn() },
  },
}))

vi.mock('./settings.server', () => ({
  setSetting: vi.fn(),
}))

const { updateCongregationSettings } = await import('./congregation-settings.server')
const { unscopedDb } = await import('~/shared/libs/db.server')
const { setSetting } = await import('./settings.server')

const mockDb = {
  user: {
    updateMany: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('updateCongregationSettings', () => {
  it('updates display name and sets the auxiliary pioneer setting', async () => {
    vi.mocked(unscopedDb.congregation.update).mockResolvedValue({} as never)
    vi.mocked(setSetting).mockResolvedValue(undefined as never)

    await updateCongregationSettings(mockDb as never, 10, {
      displayName: 'Ma Congregation',
      auxiliaryPioneerProfileActivated: 'true',
    })

    expect(unscopedDb.congregation.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { displayName: 'Ma Congregation' },
    })
    expect(setSetting).toHaveBeenCalledWith(
      mockDb,
      'auxiliary-pioneer-profile-active',
      'true',
      10,
    )
    expect(mockDb.user.updateMany).not.toHaveBeenCalled()
  })

  it('resets auxiliary pioneers to normal when feature is deactivated', async () => {
    vi.mocked(unscopedDb.congregation.update).mockResolvedValue({} as never)
    vi.mocked(setSetting).mockResolvedValue(undefined as never)
    mockDb.user.updateMany.mockResolvedValue({ count: 3 })

    await updateCongregationSettings(mockDb as never, 10, {
      displayName: null,
      auxiliaryPioneerProfileActivated: 'false',
    })

    expect(mockDb.user.updateMany).toHaveBeenCalledWith({
      where: {
        congregationId: 10,
        type: 'pionnier-auxiliaires',
      },
      data: {
        type: 'normal',
      },
    })
  })
})
