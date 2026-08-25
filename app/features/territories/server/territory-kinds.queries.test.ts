import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territoryKind: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}))

const { getKindAllowedRoleIds, listTerritoryKindsWithRoles } = await import('./territory-kinds.queries')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('listTerritoryKindsWithRoles', () => {
  it('flattens the join rows into a role-id list per kind', async () => {
    vi.mocked(db.territoryKind.findMany).mockResolvedValue([
      { id: 1, key: 'Classical', name: null, isBuiltIn: true, allowedRoles: [] },
      { id: 2, key: 'Phone', name: null, isBuiltIn: true, allowedRoles: [{ roleId: 8 }, { roleId: 3 }] },
    ] as never)

    const result = await listTerritoryKindsWithRoles(db, 4)

    expect(result).toEqual([
      { id: 1, key: 'Classical', name: null, isBuiltIn: true, allowedRoleIds: [] },
      { id: 2, key: 'Phone', name: null, isBuiltIn: true, allowedRoleIds: [8, 3] },
    ])
  })

  it('scopes the query to the congregation', async () => {
    vi.mocked(db.territoryKind.findMany).mockResolvedValue([] as never)

    await listTerritoryKindsWithRoles(db, 12)

    expect(db.territoryKind.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { congregationId: 12 } }))
  })
})

describe('getKindAllowedRoleIds', () => {
  it('returns the role ids configured for the kind', async () => {
    vi.mocked(db.territoryKind.findFirst).mockResolvedValue({
      allowedRoles: [{ roleId: 5 }, { roleId: 6 }],
    } as never)

    expect(await getKindAllowedRoleIds(db, 'Phone', 4)).toEqual([5, 6])
  })

  it('returns an empty list when the kind has no restriction', async () => {
    vi.mocked(db.territoryKind.findFirst).mockResolvedValue({ allowedRoles: [] } as never)

    expect(await getKindAllowedRoleIds(db, 'Classical', 4)).toEqual([])
  })

  it('treats an unknown kind as unrestricted rather than throwing', async () => {
    vi.mocked(db.territoryKind.findFirst).mockResolvedValue(null as never)

    expect(await getKindAllowedRoleIds(db, 'Classical', 4)).toEqual([])
  })
})
