import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/auth/permissions.server', () => ({
  findMembersWithAnyRole: vi.fn(),
}))

vi.mock('./territory-kinds.queries', () => ({
  getKindAllowedRoleIds: vi.fn(),
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    member: { findMany: vi.fn() },
  },
}))

const { findAttributablePublishers } = await import('./attributable-publishers.queries')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { findMembersWithAnyRole } = await import('~/shared/auth/permissions.server')
const { getKindAllowedRoleIds } = await import('./territory-kinds.queries')

const PUBLISHERS = [
  { id: 1, firstname: 'Marc', lastname: 'Dupont' },
  { id: 2, firstname: 'Anne', lastname: 'Leroy' },
  { id: 3, firstname: 'Paul', lastname: 'Martin' },
]

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.member.findMany).mockResolvedValue(PUBLISHERS as never)
})

describe('findAttributablePublishers', () => {
  it('returns every active publisher when the kind carries no restriction', async () => {
    vi.mocked(getKindAllowedRoleIds).mockResolvedValue([])

    const result = await findAttributablePublishers(db, 'Classical', 4)

    expect(result.map(p => p.id)).toEqual([1, 2, 3])
    expect(findMembersWithAnyRole).not.toHaveBeenCalled()
  })

  it('keeps only publishers holding one of the allowed roles', async () => {
    vi.mocked(getKindAllowedRoleIds).mockResolvedValue([7])
    vi.mocked(findMembersWithAnyRole).mockResolvedValue([3, 1])

    const result = await findAttributablePublishers(db, 'Phone', 4)

    expect(result.map(p => p.id)).toEqual([1, 3])
    expect(findMembersWithAnyRole).toHaveBeenCalledWith(db, [7], 4)
  })

  it('preserves the publisher ordering rather than the eligibility ordering', async () => {
    vi.mocked(getKindAllowedRoleIds).mockResolvedValue([7])
    vi.mocked(findMembersWithAnyRole).mockResolvedValue([3, 2, 1])

    const result = await findAttributablePublishers(db, 'Phone', 4)

    expect(result.map(p => p.id)).toEqual([1, 2, 3])
  })

  it('keeps the already-attributed publisher listed even when they no longer qualify', async () => {
    vi.mocked(getKindAllowedRoleIds).mockResolvedValue([7])
    vi.mocked(findMembersWithAnyRole).mockResolvedValue([1])

    const result = await findAttributablePublishers(db, 'Phone', 4, { alwaysIncludeMemberId: 2 })

    expect(result.map(p => p.id)).toEqual([1, 2])
  })

  it('does not duplicate the already-attributed publisher when they do qualify', async () => {
    vi.mocked(getKindAllowedRoleIds).mockResolvedValue([7])
    vi.mocked(findMembersWithAnyRole).mockResolvedValue([1, 2])

    const result = await findAttributablePublishers(db, 'Phone', 4, { alwaysIncludeMemberId: 2 })

    expect(result.map(p => p.id)).toEqual([1, 2])
  })

  it('returns nobody when the kind requires a role no publisher holds', async () => {
    vi.mocked(getKindAllowedRoleIds).mockResolvedValue([7])
    vi.mocked(findMembersWithAnyRole).mockResolvedValue([])

    expect(await findAttributablePublishers(db, 'Phone', 4)).toEqual([])
  })
})
