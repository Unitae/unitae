import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  unscopedDb: {
    user: { update: vi.fn() },
  },
}))

vi.mock('~/shared/libs/crypto.server', () => ({
  hash: vi.fn().mockResolvedValue('new-hashed-password' as never),
}))

const { resetUserPassword } = await import('./reset-user-password.server')
const { unscopedDb: db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.user.update).mockResolvedValue({} as never)
})

describe('resetUserPassword', () => {
  it('ne lance pas d\'erreur en fonctionnement normal', async () => {
    await expect(resetUserPassword(1, 'nouveau-mdp')).resolves.toBeUndefined()
  })
})
