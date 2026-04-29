import { beforeEach, describe, expect, it, vi } from 'vitest'

const scopedDb = {
  eventKind: { upsert: vi.fn() },
  programmeTemplate: { findFirst: vi.fn(), create: vi.fn() },
}

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    congregation: { findFirst: vi.fn(), create: vi.fn() },
    user: { create: vi.fn() },
    userRole: { findUnique: vi.fn(), upsert: vi.fn() },
    congregationUserRole: { create: vi.fn() },
    consentRecord: { create: vi.fn() },
  },
  withScope: vi.fn((_id: number, fn: (db: unknown) => Promise<unknown>) => fn(scopedDb)),
}))

vi.mock('~/shared/auth/crypto.server', () => ({
  hash: vi.fn().mockResolvedValue('hashed-password' as never),
}))

const { setupFirstUser } = await import('./setup-first-user.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.congregation.findFirst).mockResolvedValue(null as never)
  vi.mocked(db.congregation.create).mockResolvedValue({ id: 1, slug: 'test' } as never)
  vi.mocked(db.user.create).mockResolvedValue({ id: 42 } as never)
  vi.mocked(db.userRole.findUnique).mockResolvedValue({ id: 5, key: 'admin' } as never)
  vi.mocked(db.congregationUserRole.create).mockResolvedValue({} as never)
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
    vi.mocked(db.userRole.findUnique).mockResolvedValue(null as never)

    const result = await setupFirstUser('admin@test.com', 'motdepasse', 'Ma Congré', 'ma-congre', 'fr')
    expect(result).toBe(42)
  })
})
