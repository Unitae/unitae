import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberId } from '~/shared/types/branded'

const memberId = 5 as MemberId

vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { auditLog: { create: vi.fn() } } }))
vi.mock('~/shared/domain/built-in-roles.server', () => ({ syncBuiltInRoleAssignments: vi.fn() }))

import { togglePublisherStatus } from './publisher-status.server'

const mockDb = {
  member: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.member.findFirst.mockResolvedValue({ id: 5 })
})

describe('togglePublisherStatus', () => {
  it('throws NotFoundError when the member does not exist in the scope', async () => {
    const { NotFoundError } = await import('~/shared/errors/app-error.server')
    mockDb.member.findFirst.mockResolvedValue(null)

    await expect(togglePublisherStatus(mockDb as never, memberId, 10, true, 99)).rejects.toBeInstanceOf(NotFoundError)
    expect(mockDb.member.update).not.toHaveBeenCalled()
  })

  it('sets isPublisher to true', async () => {
    const expected = { id: 5, isPublisher: true }
    mockDb.member.update.mockResolvedValue(expected)

    const result = await togglePublisherStatus(mockDb as never, memberId, 10, true, 99)

    expect(result).toEqual(expected)
    expect(mockDb.member.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 5, congregationId: 10 } },
      data: { isPublisher: true },
    })
  })

  it('sets isPublisher to false (member becomes ministry-school student)', async () => {
    const expected = { id: 5, isPublisher: false }
    mockDb.member.update.mockResolvedValue(expected)

    const result = await togglePublisherStatus(mockDb as never, memberId, 10, false, 99)

    expect(result).toEqual(expected)
    expect(mockDb.member.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 5, congregationId: 10 } },
      data: { isPublisher: false },
    })
  })
})
