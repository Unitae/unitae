import { beforeEach, describe, expect, it, vi } from 'vitest'

const scopedDb = {
  eventKind: { upsert: vi.fn() },
  eventTemplate: { findFirst: vi.fn(), create: vi.fn() },
  // Seeding the default templates also seeds the part presets they link to.
  partPreset: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  // count + findMany: provisioning also lays down the default chart (placeDefaultOrganigram).
  role: { upsert: vi.fn(), findUnique: vi.fn(), count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
  userRoleAssignment: { create: vi.fn() },
  // Setup also seeds the built-in territory kinds.
  territoryKind: { upsert: vi.fn() },
  permission: { findUnique: vi.fn() },
  rolePermission: { upsert: vi.fn() },
}

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    congregation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    userAccount: { create: vi.fn(), count: vi.fn() },
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
  SYSTEM_ROLE_KEYS: ['admin'],
  APPOINTED_ROLE_KEYS: ['service-committee', 'coordinator', 'secretary', 'service-overseer'],
  SERVICE_COMMITTEE_KEY: 'service-committee',
  SERVICE_COMMITTEE_POST_KEYS: ['coordinator', 'secretary', 'service-overseer'],
}))

// Accounts the service actually created, so the guard test asserts on the outcome, not on spies.
const createdAccounts: { email: string }[] = []
// What the congregation is called once setup is done, whichever way it came to exist.
const congregationNames: Record<number, { name: string; locale: string }> = {}

const { setupFirstAccount } = await import('./setup-first-account.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)
  for (const id of Object.keys(congregationNames)) delete congregationNames[Number(id)]
  vi.mocked(db.congregation.create).mockImplementation((({ data }: { data: { name: string; locale: string } }) => {
    congregationNames[1] = { name: data.name, locale: data.locale }
    return Promise.resolve({ id: 1, slug: 'test' })
  }) as never)
  vi.mocked(db.congregation.update).mockImplementation((({
    where,
    data,
  }: {
    where: { id: number }
    data: { name: string; locale: string }
  }) => {
    congregationNames[where.id] = { name: data.name, locale: data.locale }
    return Promise.resolve({ id: where.id, slug: 'default' })
  }) as never)
  createdAccounts.length = 0
  vi.mocked(db.userAccount.count).mockResolvedValue(0 as never)
  vi.mocked(db.userAccount.create).mockImplementation((async ({ data }: { data: { email: string } }) => {
    createdAccounts.push({ email: data.email })
    return { id: 42 }
  }) as never)
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
  it('names a new congregation after what the admin typed', async () => {
    await setupFirstAccount('admin@test.com', 'motdepasse', 'Assemblée des Lilas', 'default', 'fr')

    expect(congregationNames[1]).toEqual({ name: 'Assemblée des Lilas', locale: 'fr' })
  })

  // The database seed may already have created the instance's congregation: setup reuses it, but under the name
  // and in the language the admin chose, not the seed's.
  it('renames the congregation the seed created, and sets its language', async () => {
    vi.mocked(db.congregation.findFirst).mockResolvedValue({ id: 9, name: 'Ma Congrégation', locale: 'fr' } as never)

    await setupFirstAccount('admin@test.com', 'motdepasse', 'Lilas Congregation', 'default', 'en')

    expect(congregationNames[9]).toEqual({ name: 'Lilas Congregation', locale: 'en' })
  })

  // Setup creates the first admin of a fresh install. Once any account exists it must refuse,
  // whoever calls it: an initialised instance must never hand out another admin account.
  it('refuses once an account exists, without creating one', async () => {
    vi.mocked(db.userAccount.count).mockResolvedValue(1 as never)

    const result = await setupFirstAccount('intruder@test.com', 'motdepasse', 'Ma Congré', 'ma-congre', 'fr')

    expect(result).toBeNull()
    expect(createdAccounts).toEqual([])
  })

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
      expect.objectContaining({ create: { key: 'admin', isBuiltIn: true, congregationId: 1 } }),
    )
    expect(scopedDb.userRoleAssignment.create).toHaveBeenCalledWith({
      data: { userId: 42, roleId: 77, congregationId: 1 },
    })
  })
})
