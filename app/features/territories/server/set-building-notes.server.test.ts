import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    building: { update: vi.fn() },
  },
}))

const { setBuildingNotes } = await import('./set-building-notes.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('setBuildingNotes', () => {
  it('met à jour les notes internes du bâtiment', async () => {
    const fakeBuilding = { id: 1, notes: 'Nouvelle note' }
    vi.mocked(db.building.update).mockResolvedValue(fakeBuilding as never)

    const result = await setBuildingNotes(db, 1, 42, { notes: 'Nouvelle note' })
    expect(result).toEqual(fakeBuilding)
    expect(db.building.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 1, congregationId: 42 } },
      data: { notes: 'Nouvelle note' },
    })
  })
})
