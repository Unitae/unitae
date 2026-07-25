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
vi.mock('~/shared/domain/built-in-roles.server', () => ({
  syncBuiltInRoleAssignments: vi.fn(),
}))

const { updateCongregationSettings } = await import('./congregation-settings.server')
const { setSetting } = await import('~/shared/domain/settings.server')
const { syncBuiltInRoleAssignments } = await import('~/shared/domain/built-in-roles.server')

const mockDb = {
  member: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.member.findMany.mockResolvedValue([])
})

describe('updateCongregationSettings', () => {
  it('sets the auxiliary pioneer setting', async () => {
    vi.mocked(setSetting).mockResolvedValue(undefined as never)

    await updateCongregationSettings(mockDb as never, 10, 99, {
      auxiliaryPioneerProfileActivated: 'true',
    })

    expect(setSetting).toHaveBeenCalledWith(mockDb, 'auxiliary-pioneer-profile-active', 'true', 10)
    expect(mockDb.member.updateMany).not.toHaveBeenCalled()
    expect(syncBuiltInRoleAssignments).not.toHaveBeenCalled()
  })

  it('resets auxiliary pioneers to normal when feature is deactivated', async () => {
    vi.mocked(setSetting).mockResolvedValue(undefined as never)
    mockDb.member.updateMany.mockResolvedValue({ count: 3 })

    await updateCongregationSettings(mockDb as never, 10, 99, {
      auxiliaryPioneerProfileActivated: 'false',
    })

    expect(mockDb.member.updateMany).toHaveBeenCalledWith({
      where: {
        congregationId: 10,
        type: PublisherType.PionnierAuxiliaires,
      },
      data: {
        type: PublisherType.Normal,
      },
    })
  })

  // Wave 1 bug 1 — regression test.
  // The bulk `updateMany` flips Member.type but used to skip
  // `syncBuiltInRoleAssignments`, leaving stale `pioneer` role assignments
  // for every member whose type was reset.
  it('syncs built-in roles for every member whose type was reset', async () => {
    vi.mocked(setSetting).mockResolvedValue(undefined as never)
    mockDb.member.findMany.mockResolvedValue([{ id: 100 }, { id: 200 }, { id: 300 }])
    mockDb.member.updateMany.mockResolvedValue({ count: 3 })

    await updateCongregationSettings(mockDb as never, 10, 99, {
      auxiliaryPioneerProfileActivated: 'false',
    })

    expect(mockDb.member.findMany).toHaveBeenCalledWith({
      where: { congregationId: 10, type: PublisherType.PionnierAuxiliaires },
      select: { id: true },
    })
    expect(syncBuiltInRoleAssignments).toHaveBeenCalledTimes(3)
    expect(syncBuiltInRoleAssignments).toHaveBeenNthCalledWith(1, mockDb, 100, 10, 99)
    expect(syncBuiltInRoleAssignments).toHaveBeenNthCalledWith(2, mockDb, 200, 10, 99)
    expect(syncBuiltInRoleAssignments).toHaveBeenNthCalledWith(3, mockDb, 300, 10, 99)
  })

  it('does not sync when no auxiliary pioneers exist to reset', async () => {
    vi.mocked(setSetting).mockResolvedValue(undefined as never)
    mockDb.member.findMany.mockResolvedValue([])
    mockDb.member.updateMany.mockResolvedValue({ count: 0 })

    await updateCongregationSettings(mockDb as never, 10, 99, {
      auxiliaryPioneerProfileActivated: 'false',
    })

    expect(mockDb.member.updateMany).toHaveBeenCalled()
    expect(syncBuiltInRoleAssignments).not.toHaveBeenCalled()
  })

  it('persists the breached-password check scope when provided', async () => {
    vi.mocked(setSetting).mockResolvedValue(undefined as never)

    await updateCongregationSettings(mockDb as never, 10, 99, {
      auxiliaryPioneerProfileActivated: 'true',
      breachedPasswordCheckScope: 'everyone',
    })

    expect(setSetting).toHaveBeenCalledWith(mockDb, 'breached-password-check-scope', 'everyone', 10)
  })

  it('does not touch the breach scope setting when it is omitted', async () => {
    vi.mocked(setSetting).mockResolvedValue(undefined as never)

    await updateCongregationSettings(mockDb as never, 10, 99, {
      auxiliaryPioneerProfileActivated: 'true',
    })

    expect(setSetting).not.toHaveBeenCalledWith(mockDb, 'breached-password-check-scope', expect.anything(), 10)
  })
})
