import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  unscopedDb: {
    user: { count: vi.fn() },
  },
}))

const { needSetupProcess } = await import('./need-setup-process.server')
const { unscopedDb: db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('needSetupProcess', () => {
  it("retourne true quand il n'y a aucun utilisateur", async () => {
    vi.mocked(db.user.count).mockResolvedValue(0)

    expect(await needSetupProcess()).toBe(true)
  })

  it('retourne false quand il y a des utilisateurs', async () => {
    vi.mocked(db.user.count).mockResolvedValue(1)

    expect(await needSetupProcess()).toBe(false)
  })

  it('retourne false quand il y a plusieurs utilisateurs', async () => {
    vi.mocked(db.user.count).mockResolvedValue(50)

    expect(await needSetupProcess()).toBe(false)
  })
})
