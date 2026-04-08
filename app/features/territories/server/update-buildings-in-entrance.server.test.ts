import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    buildingEntrance: {
      findUnique: vi.fn(),
      update: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('~/shared/libs/logger.server', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

const { updateBuildingsInEntrance } = await import('./update-buildings-in-entrance.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.buildingEntrance.deleteMany).mockResolvedValue({ count: 0 } as never)
})

describe('updateBuildingsInEntrance', () => {
  it('ne fait rien si l\'entrée n\'existe pas', async () => {
    vi.mocked(db.buildingEntrance.findUnique).mockResolvedValue(null as never)

    const sentinel = Symbol('sentinel')
    let result: unknown = sentinel
    result = await updateBuildingsInEntrance(999, [1, 2], 1)
    expect(result).toBeUndefined()
    expect(result).not.toBe(sentinel)
  })

  it('exécute la transaction pour connecter/déconnecter les bâtiments', async () => {
    vi.mocked(db.buildingEntrance.findUnique).mockResolvedValue({
      id: 10,
      access: 1,
      isMailboxOpen: false,
      // biome-ignore lint/style/useNamingConvention: Prisma model field
      isPMR: false,
      isOpenEarly: false,
      buildings: [{ id: 1 }, { id: 2 }, { id: 3 }],
    } as never)

    // $transaction exécute le callback
    vi.mocked(db.$transaction).mockImplementation((async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        buildingEntrance: {
          update: vi.fn().mockResolvedValue({} as never),
          createMany: vi.fn().mockResolvedValue({} as never),
        },
      }
      await fn(tx)
    }) as never)

    // buildingIds [1, 4] → ajouter 4, déconnecter 2 et 3
    await updateBuildingsInEntrance(10, [1, 4], 1)

    // La transaction a été exécutée
    expect(vi.mocked(db.$transaction).mock.calls).toHaveLength(1)
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

    vi.mocked(db.$transaction).mockImplementation((async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        buildingEntrance: {
          update: vi.fn().mockResolvedValue({} as never),
          createMany: vi.fn().mockResolvedValue({} as never),
        },
      }
      await fn(tx)
    }) as never)

    await updateBuildingsInEntrance(10, [1], 1)

    // deleteMany est toujours appelé pour nettoyer les entrées vides
    expect(vi.mocked(db.buildingEntrance.deleteMany).mock.calls).toHaveLength(1)
  })

  it('gère les erreurs de transaction sans planter', async () => {
    vi.mocked(db.buildingEntrance.findUnique).mockResolvedValue({
      id: 10,
      access: 1,
      isMailboxOpen: false,
      // biome-ignore lint/style/useNamingConvention: Prisma model field
      isPMR: false,
      isOpenEarly: false,
      buildings: [{ id: 1 }],
    } as never)

    vi.mocked(db.$transaction).mockRejectedValue(new Error('Transaction failed'))

    // Ne doit pas lancer d'erreur
    await expect(updateBuildingsInEntrance(10, [1, 2], 1)).resolves.toBeUndefined()
  })
})
