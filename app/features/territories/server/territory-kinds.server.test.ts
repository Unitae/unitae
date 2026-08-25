import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  // biome-ignore lint/style/useNamingConvention: mirrors the AuditAction const shape
  AuditAction: { TerritoryKindAllowedRolesChanged: 'territory_kind.allowed_roles.changed' },
  audit: vi.fn(),
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territoryKind: { upsert: vi.fn(), findFirst: vi.fn() },
    territoryKindAllowedRole: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  },
}))

const { seedBuiltInTerritoryKinds, setKindAllowedRoles } = await import('./territory-kinds.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { audit } = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('seedBuiltInTerritoryKinds', () => {
  it('upserts one built-in row per kind key', async () => {
    await seedBuiltInTerritoryKinds(db, 3)

    expect(db.territoryKind.upsert).toHaveBeenCalledTimes(5)
    const keys = vi.mocked(db.territoryKind.upsert).mock.calls.map(([args]) => args.create.key)
    expect(keys.sort()).toEqual(['Classical', 'Commerces', 'Hotel', 'Phone', 'Univ'])
  })

  it('marks seeded rows built-in and scopes them to the congregation', async () => {
    await seedBuiltInTerritoryKinds(db, 7)

    for (const [args] of vi.mocked(db.territoryKind.upsert).mock.calls) {
      expect(args.create).toMatchObject({ isBuiltIn: true, congregationId: 7 })
      expect(args.update).toEqual({ isBuiltIn: true })
    }
  })
})

describe('setKindAllowedRoles', () => {
  it('returns an empty diff and writes nothing when the selection is unchanged', async () => {
    vi.mocked(db.territoryKind.findFirst).mockResolvedValue({ id: 9 } as never)
    vi.mocked(db.territoryKindAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }, { roleId: 2 }] as never)

    const diff = await setKindAllowedRoles(db, 'Phone', [2, 1], 4, 100)

    expect(diff).toEqual({ added: [], removed: [] })
    expect(db.territoryKindAllowedRole.createMany).not.toHaveBeenCalled()
    expect(db.territoryKindAllowedRole.deleteMany).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('adds and removes only what changed', async () => {
    vi.mocked(db.territoryKind.findFirst).mockResolvedValue({ id: 9 } as never)
    vi.mocked(db.territoryKindAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }, { roleId: 2 }] as never)

    const diff = await setKindAllowedRoles(db, 'Phone', [2, 3], 4, 100)

    expect(diff).toEqual({ added: [3], removed: [1] })
    expect(db.territoryKindAllowedRole.deleteMany).toHaveBeenCalledWith({
      where: { kindId: 9, congregationId: 4, roleId: { in: [1] } },
    })
    expect(db.territoryKindAllowedRole.createMany).toHaveBeenCalledWith({
      data: [{ kindId: 9, roleId: 3, congregationId: 4 }],
      skipDuplicates: true,
    })
  })

  it('clears every role when the selection is emptied', async () => {
    vi.mocked(db.territoryKind.findFirst).mockResolvedValue({ id: 9 } as never)
    vi.mocked(db.territoryKindAllowedRole.findMany).mockResolvedValue([{ roleId: 1 }, { roleId: 2 }] as never)

    const diff = await setKindAllowedRoles(db, 'Phone', [], 4, 100)

    expect(diff).toEqual({ added: [], removed: [1, 2] })
    expect(db.territoryKindAllowedRole.createMany).not.toHaveBeenCalled()
  })

  it('audits the change against the kind', async () => {
    vi.mocked(db.territoryKind.findFirst).mockResolvedValue({ id: 9 } as never)
    vi.mocked(db.territoryKindAllowedRole.findMany).mockResolvedValue([] as never)

    await setKindAllowedRoles(db, 'Phone', [3], 4, 100)

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'territory_kind.allowed_roles.changed',
        congregationId: 4,
        actorId: 100,
        entityType: 'TerritoryKind',
        entityId: 9,
        metadata: { key: 'Phone', added: [3], removed: [] },
      }),
    )
  })

  it('throws when the kind does not exist in the congregation', async () => {
    vi.mocked(db.territoryKind.findFirst).mockResolvedValue(null as never)

    await expect(setKindAllowedRoles(db, 'Phone', [3], 4, 100)).rejects.toThrow()
    expect(db.territoryKindAllowedRole.createMany).not.toHaveBeenCalled()
  })
})
