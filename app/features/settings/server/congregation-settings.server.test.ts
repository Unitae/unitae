import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    congregation: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('~/shared/domain/settings.server', () => ({
  setSetting: vi.fn(),
}))
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))

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

    await updateCongregationSettings(mockDb as never, 10, 99, {
      auxiliaryPioneerProfileActivated: 'true',
    })

    expect(setSetting).toHaveBeenCalledWith(mockDb, 'auxiliary-pioneer-profile-active', 'true', 10)
    expect(mockDb.userAccount.updateMany).not.toHaveBeenCalled()
  })

  it('resets auxiliary pioneers to normal when feature is deactivated', async () => {
    vi.mocked(setSetting).mockResolvedValue(undefined as never)
    mockDb.userAccount.updateMany.mockResolvedValue({ count: 3 })

    await updateCongregationSettings(mockDb as never, 10, 99, {
      auxiliaryPioneerProfileActivated: 'false',
    })

    expect(mockDb.userAccount.updateMany).toHaveBeenCalledWith({
      where: {
        congregationId: 10,
        type: PublisherType.PionnierAuxiliaires,
      },
      data: {
        type: PublisherType.Normal,
      },
    })
  })
})
