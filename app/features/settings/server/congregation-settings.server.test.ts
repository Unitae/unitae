import { beforeEach, describe, expect, it, vi } from 'vitest'

// biome-ignore lint/style/useNamingConvention: AuditAction mock matches exported name
vi.mock('~/shared/domain/audit.server', () => ({ audit: vi.fn(), AuditAction: {} }))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    congregation: { update: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}))

vi.mock('~/shared/domain/settings.server', () => ({
  setSetting: vi.fn(),
}))

const { updateCongregationSettings } = await import('./congregation-settings.server')
const { setSetting } = await import('~/shared/domain/settings.server')

const mockDb = {
  user: {
    updateMany: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('updateCongregationSettings', () => {
  it('sets the auxiliary pioneer setting', async () => {
    vi.mocked(setSetting).mockResolvedValue(undefined as never)

    await updateCongregationSettings(
      mockDb as never,
      10,
      {
        auxiliaryPioneerProfileActivated: 'true',
      },
      1,
    )

    expect(setSetting).toHaveBeenCalledWith(mockDb, 'auxiliary-pioneer-profile-active', 'true', 10)
    expect(mockDb.user.updateMany).not.toHaveBeenCalled()
  })

  it('resets auxiliary pioneers to normal when feature is deactivated', async () => {
    vi.mocked(setSetting).mockResolvedValue(undefined as never)
    mockDb.user.updateMany.mockResolvedValue({ count: 3 })

    await updateCongregationSettings(
      mockDb as never,
      10,
      {
        auxiliaryPioneerProfileActivated: 'false',
      },
      1,
    )

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
