import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { auditLog: { create: vi.fn() } } }))
vi.mock('~/shared/domain/built-in-roles.server', () => ({ syncBuiltInRoleAssignments: vi.fn() }))

import { togglePublisherStatus } from './publisher-status.server'

const mockDb = {
  user: {
    update: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('togglePublisherStatus', () => {
  it('sets isPublisher to true', async () => {
    const expected = { id: 5, isPublisher: true }
    mockDb.user.update.mockResolvedValue(expected)

    const result = await togglePublisherStatus(mockDb as never, 5, 10, true, 99)

    expect(result).toEqual(expected)
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 5, congregationId: 10 } },
      data: { isPublisher: true },
    })
  })

  it('sets isPublisher to false', async () => {
    const expected = { id: 5, isPublisher: false }
    mockDb.user.update.mockResolvedValue(expected)

    const result = await togglePublisherStatus(mockDb as never, 5, 10, false, 99)

    expect(result).toEqual(expected)
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 5, congregationId: 10 } },
      data: { isPublisher: false },
    })
  })
})
