import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    buildingEntrance: {
      findUnique: vi.fn(),
      update: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

const { updateBuildingsInEntrance } = await import('./update-buildings-in-entrance.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.buildingEntrance.update).mockResolvedValue({} as never)
  vi.mocked(db.buildingEntrance.createMany).mockResolvedValue({} as never)
  vi.mocked(db.buildingEntrance.deleteMany).mockResolvedValue({ count: 0 } as never)
})

describe('updateBuildingsInEntrance', () => {
  it("ne fait rien si l'entrée n'existe pas", async () => {
    vi.mocked(db.buildingEntrance.findUnique).mockResolvedValue(null as never)

    const sentinel = Symbol('sentinel')
    let result: unknown = sentinel
    result = await updateBuildingsInEntrance(db as never, 999, [1, 2], 1)
    expect(result).toBeUndefined()
    expect(result).not.toBe(sentinel)
  })

  it('connecte et déconnecte les bâtiments directement', async () => {
    vi.mocked(db.buildingEntrance.findUnique).mockResolvedValue({
      id: 10,
      access: 1,
      isMailboxOpen: false,
      // biome-ignore lint/style/useNamingConvention: Prisma model field
      isPMR: false,
      isOpenEarly: false,
      buildings: [{ id: 1 }, { id: 2 }, { id: 3 }],
    } as never)

    // buildingIds [1, 4] → ajouter 4, déconnecter 2 et 3
    await updateBuildingsInEntrance(db as never, 10, [1, 4], 1)

    // update a été appelé pour connecter/déconnecter
    expect(vi.mocked(db.buildingEntrance.update).mock.calls).toHaveLength(1)
  })

  it('nettoie les entrées vides après la mise à jour', async () => {
    vi.mocked(db.buildingEntrance.findUnique).mockResolvedValue({
      id: 10,
      access: 1,
      isMailboxOpen: false,
      // biome-ignore lint/style/useNamingConvention: Prisma model field
      isPMR: false,
      isOpenEarly: false,
      buildings: [{ id: 1 }],
    } as never)

    await updateBuildingsInEntrance(db as never, 10, [1], 1)

    // deleteMany est toujours appelé pour nettoyer les entrées vides
    expect(vi.mocked(db.buildingEntrance.deleteMany).mock.calls).toHaveLength(1)
  })

  it('gère les erreurs sans planter', async () => {
    vi.mocked(db.buildingEntrance.findUnique).mockResolvedValue({
      id: 10,
      access: 1,
      isMailboxOpen: false,
      // biome-ignore lint/style/useNamingConvention: Prisma model field
      isPMR: false,
      isOpenEarly: false,
      buildings: [{ id: 1 }],
    } as never)

    vi.mocked(db.buildingEntrance.update).mockRejectedValue(new Error('Update failed'))

    // Ne doit pas lancer d'erreur
    await expect(updateBuildingsInEntrance(db as never, 10, [1, 2], 1)).resolves.toBeUndefined()
  })
})
