import { beforeEach, describe, expect, it, vi } from 'vitest'

const scopedDb = {
  eventKind: { upsert: vi.fn() },
  programmeTemplate: { findFirst: vi.fn(), create: vi.fn() },
  role: { upsert: vi.fn(), findUnique: vi.fn() },
  permission: { findUnique: vi.fn() },
  rolePermission: { upsert: vi.fn() },
}

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    congregation: { findFirst: vi.fn(), create: vi.fn() },
    userAccount: { create: vi.fn() },
    permission: { findUnique: vi.fn(), upsert: vi.fn() },
    congregationUserPermission: { create: vi.fn() },
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

const { setupFirstUser } = await import('./setup-first-user.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)
  vi.mocked(db.congregation.create).mockResolvedValue({ id: 1, slug: 'test' } as never)
  vi.mocked(db.userAccount.create).mockResolvedValue({ id: 42 } as never)
  vi.mocked(db.permission.findUnique).mockResolvedValue({ id: 5, key: 'admin' } as never)
  vi.mocked(db.congregationUserPermission.create).mockResolvedValue({} as never)
  scopedDb.eventKind.upsert.mockResolvedValue({} as never)
  scopedDb.programmeTemplate.findFirst.mockResolvedValue(null as never)
  scopedDb.programmeTemplate.create.mockResolvedValue({} as never)
})

describe('setupFirstUser', () => {
  it("retourne l'id de l'utilisateur créé", async () => {
    const result = await setupFirstUser('admin@test.com', 'motdepasse', 'Ma Congré', 'ma-congre', 'fr')
    expect(result).toBe(42)
  })

  it("fonctionne même si le rôle admin n'existe pas", async () => {
    vi.mocked(db.permission.findUnique).mockResolvedValue(null as never)

    const result = await setupFirstUser('admin@test.com', 'motdepasse', 'Ma Congré', 'ma-congre', 'fr')
    expect(result).toBe(42)
  })
})
