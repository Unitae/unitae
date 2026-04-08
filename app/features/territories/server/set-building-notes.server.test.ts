import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    building: { update: vi.fn() },
  },
}))

const { setBuildingNotes } = await import('./set-building-notes.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('setBuildingNotes', () => {
  it('met à jour les notes du bâtiment', async () => {
    const fakeBuilding = { id: 1, notes: 'Nouvelle note', importantNotes: 'Important!' }
    vi.mocked(db.building.update).mockResolvedValue(fakeBuilding as never)

    const result = await setBuildingNotes(1, { notes: 'Nouvelle note', importantNotes: 'Important!' })
    expect(result).toEqual(fakeBuilding)
  })
})
