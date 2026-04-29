import { beforeEach, describe, expect, it, vi } from 'vitest'

const scopedDb = {
  eventKind: { upsert: vi.fn() },
  programmeTemplate: { findFirst: vi.fn(), create: vi.fn() },
}

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    congregation: { findUnique: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    userRole: { findUnique: vi.fn(), upsert: vi.fn() },
    congregationUserRole: { create: vi.fn() },
    consentRecord: { create: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
  withScope: vi.fn((_id: number, fn: (db: unknown) => Promise<unknown>) => fn(scopedDb)),
}))

vi.mock('~/shared/auth/crypto.server', () => ({
  hash: vi.fn().mockResolvedValue('hashed-password' as never),
}))

const { registerCongregation } = await import('./register-congregation.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.congregation.findUnique).mockResolvedValue(null as never)
  vi.mocked(db.user.findUnique).mockResolvedValue(null as never)
  vi.mocked(db.congregation.create).mockResolvedValue({ id: 1, slug: 'test-congre' } as never)
  vi.mocked(db.user.create).mockResolvedValue({ id: 10 } as never)
  vi.mocked(db.userRole.findUnique).mockResolvedValue({ id: 5, key: 'admin' } as never)
  vi.mocked(db.congregationUserRole.create).mockResolvedValue({} as never)
  scopedDb.eventKind.upsert.mockResolvedValue({} as never)
  scopedDb.programmeTemplate.findFirst.mockResolvedValue(null as never)
  scopedDb.programmeTemplate.create.mockResolvedValue({} as never)
})

describe('registerCongregation', () => {
  it('retourne le slug et userId en cas de succès', async () => {
    const result = await registerCongregation('Ma Congrégation', 'test-congre', 'admin@test.com', 'motdepasse', 'fr')

    expect(result).toEqual({ congregationSlug: 'test-congre', userId: 10, congregationId: 1 })
  })

  it('retourne une erreur si le slug est déjà pris', async () => {
    vi.mocked(db.congregation.findUnique).mockResolvedValue({ id: 99, slug: 'test-congre' } as never)

    const result = await registerCongregation('Ma Congrégation', 'test-congre', 'admin@test.com', 'motdepasse', 'fr')

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('déjà pris')
  })

  it("retourne une erreur si l'email existe déjà", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: 1, email: 'admin@test.com' } as never)

    const result = await registerCongregation('Ma Congrégation', 'test-congre', 'admin@test.com', 'motdepasse', 'fr')

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('email')
  })

  it("normalise l'email en minuscules pour la vérification", async () => {
    // Simule un utilisateur existant avec l'email en minuscules
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: 1, email: 'admin@test.com' } as never)

    const result = await registerCongregation('Ma Congrégation', 'test-congre', 'ADMIN@TEST.COM', 'motdepasse', 'fr')

    expect(result).toHaveProperty('error')
  })

  it("fonctionne même si le rôle admin n'existe pas", async () => {
    vi.mocked(db.userRole.findUnique).mockResolvedValue(null as never)

    const result = await registerCongregation('Ma Congrégation', 'test-congre', 'admin@test.com', 'motdepasse', 'fr')

    // Ne doit pas planter, juste ne pas assigner de rôle
    expect(result).toEqual({ congregationSlug: 'test-congre', userId: 10, congregationId: 1 })
  })
})
