import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberId } from '~/shared/types/branded'

const memberId = 1 as MemberId

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { PublisherReactivated: 'publisher.reactivated' },
  audit: vi.fn(),
}))
vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { auditLog: { create: vi.fn() } } }))

const { setMemberActive } = await import('./set-member-active.server')
const { audit } = await import('~/shared/domain/audit.server')
const { NotFoundError } = await import('~/shared/errors/app-error.server')

const mockDb = {
  member: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('setMemberActive', () => {
  it('throws NotFoundError when the member does not exist', async () => {
    mockDb.member.findFirst.mockResolvedValue(null)

    await expect(setMemberActive(mockDb as never, memberId, 10, 99)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('returns early without writing when inactiveAt is already null', async () => {
    const sentinel = { id: 1, inactiveAt: null }
    mockDb.member.findFirst.mockResolvedValue(sentinel)

    const result = await setMemberActive(mockDb as never, memberId, 10, 99)

    expect(result).toBe(sentinel)
    expect(mockDb.member.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('clears inactiveAt and audits PublisherReactivated when the member is inactive', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 1, inactiveAt: new Date('2026-01-01') })
    const updated = { id: 1, inactiveAt: null, congregationId: 10 }
    mockDb.member.update.mockResolvedValue(updated)

    const result = await setMemberActive(mockDb as never, memberId, 10, 99)

    expect(result).toBe(updated)
    expect(mockDb.member.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 1, congregationId: 10 } },
      data: { inactiveAt: null },
    })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'publisher.reactivated',
        congregationId: 10,
        actorId: 99,
        entityType: 'Member',
        entityId: 1,
        metadata: { trigger: 'manual' },
      }),
    )
  })
})
