import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  db: {
    building: { update: vi.fn() },
  },
}))

const { setBuildingNotes } = await import('./set-building-notes.server')
const { db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('setBuildingNotes', () => {
  it('met à jour les notes internes du bâtiment', async () => {
    const fakeBuilding = { id: 1, notes: 'Nouvelle note' }
    vi.mocked(db.building.update).mockResolvedValue(fakeBuilding as never)

    const result = await setBuildingNotes(db, 1, { notes: 'Nouvelle note' })
    expect(result).toEqual(fakeBuilding)
  })
})
