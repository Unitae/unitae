import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  unscopedDb: {
    congregation: { create: vi.fn() },
    user: { create: vi.fn() },
    userRole: { findUnique: vi.fn() },
    congregationUserRole: { create: vi.fn() },
  },
}))

vi.mock('~/shared/libs/crypto.server', () => ({
  hash: vi.fn().mockResolvedValue('hashed-password'),
}))

const { setupFirstUser } = await import('./setup-first-user.server')
const { unscopedDb: db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.congregation.create).mockResolvedValue({ id: 1, slug: 'test' })
  vi.mocked(db.user.create).mockResolvedValue({ id: 42 })
  vi.mocked(db.userRole.findUnique).mockResolvedValue({ id: 5, key: 'admin' })
  vi.mocked(db.congregationUserRole.create).mockResolvedValue({})
})

describe('setupFirstUser', () => {
  it('retourne l\'id de l\'utilisateur créé', async () => {
    const result = await setupFirstUser('admin@test.com', 'motdepasse', 'Ma Congré', 'ma-congre')
    expect(result).toBe(42)
  })

  it('fonctionne même si le rôle admin n\'existe pas', async () => {
    vi.mocked(db.userRole.findUnique).mockResolvedValue(null)

    const result = await setupFirstUser('admin@test.com', 'motdepasse', 'Ma Congré', 'ma-congre')
    expect(result).toBe(42)
  })
})
