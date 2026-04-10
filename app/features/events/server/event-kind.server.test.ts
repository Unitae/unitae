import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    eventKind: { findMany: vi.fn() },
  },
}))

const { getAllEventType } = await import('./event-kind.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getAllEventType', () => {
  it("retourne tous les types d'événements", async () => {
    const fakeEventKinds = [
      { id: 1, key: 'off', name: 'Absence' },
      { id: 2, key: 'meeting', name: 'Réunion' },
    ]
    vi.mocked(db.eventKind.findMany).mockResolvedValue(fakeEventKinds as never)

    const result = await getAllEventType(db)
    expect(result).toEqual(fakeEventKinds)
  })

  it("retourne un tableau vide quand il n'y a pas de types", async () => {
    vi.mocked(db.eventKind.findMany).mockResolvedValue([] as never)

    const result = await getAllEventType(db)
    expect(result).toEqual([])
  })
})
