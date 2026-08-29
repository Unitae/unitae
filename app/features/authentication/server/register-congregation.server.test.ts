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
    congregation: { findUnique: vi.fn(), create: vi.fn() },
    userAccount: { findUnique: vi.fn(), create: vi.fn() },
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

vi.mock('~/shared/infra/logger.server', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}))

const { registerCongregation } = await import('./register-congregation.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

// Base slug 'test-congre' followed by the mandatory 8-char hex random suffix.
const SUFFIXED_SLUG = /^test-congre-[0-9a-f]{8}$/

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.congregation.findUnique).mockResolvedValue(null as never)
  vi.mocked(db.userAccount.findUnique).mockResolvedValue(null as never)
  // Echo the generated slug back so assertions observe what was actually created.
  vi.mocked(db.congregation.create).mockImplementation((async ({ data }: { data: { slug: string } }) => ({
    id: 1,
    slug: data.slug,
  })) as never)
  vi.mocked(db.userAccount.create).mockResolvedValue({ id: 10 } as never)
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

describe('registerCongregation', () => {
  it('retourne le userId et un slug suffixé aléatoirement en cas de succès', async () => {
    const result = await registerCongregation('Ma Congrégation', 'test-congre', 'admin@test.com', 'motdepasse', 'fr')

    expect(result).toHaveProperty('userId', 10)
    // The subdomain must never be derivable from the name: a random suffix is mandatory.
    expect('congregationSlug' in result && result.congregationSlug).toMatch(SUFFIXED_SLUG)
    expect('congregationSlug' in result && result.congregationSlug).not.toBe('test-congre')
  })

  it('donne les droits admin au premier compte via un rôle, pas un octroi direct', async () => {
    await registerCongregation('Ma Congrégation', 'test-congre', 'admin@test.com', 'motdepasse', 'fr')

    // Depuis #149 l'arête directe utilisateur->permission n'existe plus : le
    // compte créé à l'inscription ne peut devenir admin qu'en passant par un rôle.
    expect(scopedDb.role.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { key: 'admin', isBuiltIn: true, congregationId: 1 } }),
    )
    expect(scopedDb.userRoleAssignment.create).toHaveBeenCalledWith({
      data: { userId: 10, roleId: 77, congregationId: 1 },
    })
  })

  it('génère des slugs différents pour deux inscriptions du même nom', async () => {
    const first = await registerCongregation('Ma Congrégation', 'test-congre', 'a@test.com', 'motdepasse', 'fr')
    const second = await registerCongregation('Ma Congrégation', 'test-congre', 'b@test.com', 'motdepasse', 'fr')

    const firstSlug = 'congregationSlug' in first && first.congregationSlug
    const secondSlug = 'congregationSlug' in second && second.congregationSlug
    expect(firstSlug).not.toBe(secondSlug)
  })

  it('réessaie et réussit si le premier slug candidat est déjà pris', async () => {
    vi.mocked(db.congregation.findUnique)
      .mockResolvedValueOnce({ id: 99, slug: 'test-congre-deadbeef' } as never)
      .mockResolvedValue(null as never)

    const result = await registerCongregation('Ma Congrégation', 'test-congre', 'admin@test.com', 'motdepasse', 'fr')

    expect(result).toHaveProperty('userId', 10)
    expect('congregationSlug' in result && result.congregationSlug).toMatch(SUFFIXED_SLUG)
  })

  it('retourne une erreur gracieuse si aucun slug unique ne peut être généré', async () => {
    // Every candidate collides → generation is exhausted. The failure must flow
    // through the return-based error contract, not escape as a thrown 500.
    vi.mocked(db.congregation.findUnique).mockResolvedValue({ id: 99, slug: 'taken' } as never)

    const result = await registerCongregation('Ma Congrégation', 'test-congre', 'admin@test.com', 'motdepasse', 'fr')

    expect(result).toHaveProperty('error')
    expect(result).not.toHaveProperty('congregationSlug')
  })

  it("retourne une erreur si l'email existe déjà", async () => {
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ id: 1, email: 'admin@test.com' } as never)

    const result = await registerCongregation('Ma Congrégation', 'test-congre', 'admin@test.com', 'motdepasse', 'fr')

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('email')
    // The email check short-circuits before any slug work — no congregation is created.
    expect(result).not.toHaveProperty('congregationSlug')
  })

  it("normalise l'email en minuscules pour la vérification", async () => {
    // Simule un utilisateur existant avec l'email en minuscules
    vi.mocked(db.userAccount.findUnique).mockResolvedValue({ id: 1, email: 'admin@test.com' } as never)

    const result = await registerCongregation('Ma Congrégation', 'test-congre', 'ADMIN@TEST.COM', 'motdepasse', 'fr')

    expect(result).toHaveProperty('error')
  })

  it("fonctionne même si le rôle admin n'existe pas", async () => {
    vi.mocked(db.permission.findUnique).mockResolvedValue(null as never)

    const result = await registerCongregation('Ma Congrégation', 'test-congre', 'admin@test.com', 'motdepasse', 'fr')

    // Ne doit pas planter, juste ne pas assigner de rôle
    expect(result).toHaveProperty('userId', 10)
    expect('congregationSlug' in result && result.congregationSlug).toMatch(SUFFIXED_SLUG)
  })
})
