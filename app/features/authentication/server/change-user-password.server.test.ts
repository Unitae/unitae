import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  unscopedDb: {
    user: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('~/shared/libs/crypto.server', () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}))

vi.mock('./reset-user-password.server', () => ({
  resetUserPassword: vi.fn(),
}))

const { changeUserPassword } = await import('./change-user-password.server')
const { unscopedDb: db } = await import('~/shared/libs/db.server')
const { compare } = await import('~/shared/libs/crypto.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('changeUserPassword', () => {
  const fakeUser = { id: 1, password: 'old.hashed' }

  it('retourne true quand le mot de passe actuel est correct', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(compare).mockResolvedValue(true as never)

    const result = await changeUserPassword(1, 'ancien', 'nouveau')
    expect(result).toBe(true)
  })

  it('retourne false quand l\'utilisateur n\'existe pas', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue(null as never)

    const result = await changeUserPassword(999, 'ancien', 'nouveau')
    expect(result).toBe(false)
  })

  it('retourne false quand le mot de passe actuel est incorrect', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(compare).mockResolvedValue(false as never)

    const result = await changeUserPassword(1, 'mauvais', 'nouveau')
    expect(result).toBe(false)
  })

  it('retourne false quand compare lance une erreur', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue(fakeUser as never)
    vi.mocked(compare).mockRejectedValue(new Error('crypto error'))

    const result = await changeUserPassword(1, 'ancien', 'nouveau')
    expect(result).toBe(false)
  })
})
