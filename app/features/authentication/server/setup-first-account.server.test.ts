import { beforeEach, describe, expect, it, vi } from 'vitest'

const scopedDb = {
  eventKind: { upsert: vi.fn() },
  eventTemplate: { findFirst: vi.fn(), create: vi.fn() },
  // Seeding the default templates also seeds the part presets they link to.
  partPreset: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  role: { upsert: vi.fn(), findUnique: vi.fn() },
  userRoleAssignment: { create: vi.fn() },
  // Setup also seeds the built-in territory kinds.
  territoryKind: { upsert: vi.fn() },
  permission: { findUnique: vi.fn() },
  rolePermission: { upsert: vi.fn() },
}

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    congregation: { findFirst: vi.fn(), create: vi.fn() },
    userAccount: { create: vi.fn() },
    permission: { findUnique: vi.fn(), upsert: vi.fn() },
    consentRecord: { create: vi.fn() },
  },
  withScope: vi.fn((_id: number, fn: (db: unknown) => Promise<unknown>) => fn(scopedDb)),
}))

vi.mock('~/shared/auth/crypto.server', () => ({
  hash: vi.fn().mockResolvedValue('hashed-password' as never),
}))

vi.mock('~/shared/domain/built-in-roles.server', () => ({
  syncBuiltInRoleAssignments: vi.fn(),
  BUILT_IN_ROLE_KEYS: ['male', 'female', 'publisher', 'baptized', 'anointed', 'elder', 'assistant-servant'],
}))

const { setupFirstAccount } = await import('./setup-first-account.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)
  vi.mocked(db.congregation.create).mockResolvedValue({ id: 1, slug: 'test' } as never)
  vi.mocked(db.userAccount.create).mockResolvedValue({ id: 42 } as never)
  vi.mocked(db.permission.findUnique).mockResolvedValue({ id: 5, key: 'admin' } as never)
  scopedDb.permission.findUnique.mockResolvedValue({ id: 5 } as never)
  scopedDb.role.upsert.mockResolvedValue({ id: 77 } as never)
  scopedDb.rolePermission.upsert.mockResolvedValue({} as never)
  scopedDb.userRoleAssignment.create.mockResolvedValue({} as never)
  scopedDb.eventKind.upsert.mockResolvedValue({} as never)
  scopedDb.eventTemplate.findFirst.mockResolvedValue(null as never)
  scopedDb.eventTemplate.create.mockResolvedValue({} as never)
  scopedDb.partPreset.findFirst.mockResolvedValue(null as never)
  scopedDb.partPreset.create.mockResolvedValue({} as never)
  scopedDb.partPreset.findMany.mockResolvedValue([] as never)
})

describe('setupFirstAccount', () => {
  it("retourne l'id de l'utilisateur créé", async () => {
    const result = await setupFirstAccount('admin@test.com', 'motdepasse', 'Ma Congré', 'ma-congre', 'fr')
    expect(result).toBe(42)
  })

  it("fonctionne même si la permission admin n'existe pas", async () => {
    scopedDb.permission.findUnique.mockResolvedValue(null as never)

    const result = await setupFirstAccount('admin@test.com', 'motdepasse', 'Ma Congré', 'ma-congre', 'fr')
    expect(result).toBe(42)
  })

  it('donne les droits admin au premier compte via un rôle, pas un octroi direct', async () => {
    await setupFirstAccount('admin@test.com', 'motdepasse', 'Ma Congré', 'ma-congre', 'fr')

    // Depuis #149 l'arête directe utilisateur->permission n'existe plus : le
    // premier compte ne peut devenir admin qu'en passant par un rôle.
    expect(scopedDb.role.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { key: 'can-do-anything', isBuiltIn: false, congregationId: 1 } }),
    )
    expect(scopedDb.userRoleAssignment.create).toHaveBeenCalledWith({
      data: { userId: 42, roleId: 77, congregationId: 1 },
    })
  })
})
