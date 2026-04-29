import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    building: { findMany: vi.fn() },
  },
}))

const { getBuildings } = await import('./get-buildings.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getBuildings', () => {
  it('retourne les bâtiments filtrés par code postal et rue', async () => {
    const fakeBuildings = [{ id: 1, zip: '75001', street: 'Rue Test' }]
    vi.mocked(db.building.findMany).mockResolvedValue(fakeBuildings as never)

    const result = await getBuildings(db, 1, '75001', 'Rue Test')
    expect(result).toEqual(fakeBuildings)
  })

  it('retourne un tableau vide quand aucun bâtiment ne correspond', async () => {
    vi.mocked(db.building.findMany).mockResolvedValue([] as never)

    const result = await getBuildings(db, 1, '00000', 'Rue Inexistante')
    expect(result).toEqual([])
  })
})
