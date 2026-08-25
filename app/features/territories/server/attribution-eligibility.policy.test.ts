import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/auth/permissions.server', () => ({
  findMembersWithAnyRole: vi.fn(),
}))

vi.mock('./territory-kinds.queries', () => ({
  getKindAllowedRoleIds: vi.fn(),
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territory: { findFirst: vi.fn() },
    attribution: { findFirst: vi.fn() },
  },
}))

const { assertPublisherAllowedForKind, assertPublisherAllowedForAttribution } = await import(
  './attribution-eligibility.policy'
)
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { findMembersWithAnyRole } = await import('~/shared/auth/permissions.server')
const { getKindAllowedRoleIds } = await import('./territory-kinds.queries')
const { ConflictError } = await import('~/shared/errors/app-error.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('assertPublisherAllowedForKind', () => {
  it('passes when the kind carries no restriction', async () => {
    vi.mocked(getKindAllowedRoleIds).mockResolvedValue([])

    await expect(assertPublisherAllowedForKind(db, 'Classical', 5, 4)).resolves.toBeUndefined()
    expect(findMembersWithAnyRole).not.toHaveBeenCalled()
  })

  it('passes when the publisher holds one of the allowed roles', async () => {
    vi.mocked(getKindAllowedRoleIds).mockResolvedValue([7])
    vi.mocked(findMembersWithAnyRole).mockResolvedValue([5, 9])

    await expect(assertPublisherAllowedForKind(db, 'Phone', 5, 4)).resolves.toBeUndefined()
  })

  it('rejects a publisher who holds none of the allowed roles', async () => {
    vi.mocked(getKindAllowedRoleIds).mockResolvedValue([7])
    vi.mocked(findMembersWithAnyRole).mockResolvedValue([9])

    await expect(assertPublisherAllowedForKind(db, 'Phone', 5, 4)).rejects.toThrow(ConflictError)
    await expect(assertPublisherAllowedForKind(db, 'Phone', 5, 4)).rejects.toThrow('publisher_role_not_allowed')
  })
})

describe('assertPublisherAllowedForAttribution', () => {
  it('resolves the kind from the attribution territory before checking', async () => {
    vi.mocked(db.attribution.findFirst).mockResolvedValue({
      publisherId: 2,
      territory: { type: 'Phone' },
    } as never)
    vi.mocked(getKindAllowedRoleIds).mockResolvedValue([7])
    vi.mocked(findMembersWithAnyRole).mockResolvedValue([5])

    await expect(assertPublisherAllowedForAttribution(db, 11, 5, 4)).resolves.toBeUndefined()
    expect(getKindAllowedRoleIds).toHaveBeenCalledWith(db, 'Phone', 4)
  })

  it('rejects a change to a publisher who does not qualify for the territory kind', async () => {
    vi.mocked(db.attribution.findFirst).mockResolvedValue({
      publisherId: 2,
      territory: { type: 'Phone' },
    } as never)
    vi.mocked(getKindAllowedRoleIds).mockResolvedValue([7])
    vi.mocked(findMembersWithAnyRole).mockResolvedValue([9])

    await expect(assertPublisherAllowedForAttribution(db, 11, 5, 4)).rejects.toThrow('publisher_role_not_allowed')
  })

  it('leaves an unchanged publisher alone, so tightening a kind cannot lock an attribution', async () => {
    vi.mocked(db.attribution.findFirst).mockResolvedValue({
      publisherId: 5,
      territory: { type: 'Phone' },
    } as never)
    vi.mocked(getKindAllowedRoleIds).mockResolvedValue([7])
    vi.mocked(findMembersWithAnyRole).mockResolvedValue([9])

    await expect(assertPublisherAllowedForAttribution(db, 11, 5, 4)).resolves.toBeUndefined()
    expect(getKindAllowedRoleIds).not.toHaveBeenCalled()
  })

  it('passes when the attribution is gone — the aggregate reports the real failure', async () => {
    vi.mocked(db.attribution.findFirst).mockResolvedValue(null as never)

    await expect(assertPublisherAllowedForAttribution(db, 11, 5, 4)).resolves.toBeUndefined()
    expect(getKindAllowedRoleIds).not.toHaveBeenCalled()
  })
})
