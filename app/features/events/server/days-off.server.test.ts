import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    event: { findMany: vi.fn(), create: vi.fn() },
    eventKind: { findFirst: vi.fn() },
  },
}))

const { createDayOff } = await import('./days-off.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createDayOff', () => {
  it('retourne null quand startDate est null', async () => {
    const result = await createDayOff(1, null, new Date(2025, 3, 10))
    expect(result).toBeNull()
  })

  it('retourne null quand endDate est null', async () => {
    const result = await createDayOff(1, new Date(2025, 3, 8), null)
    expect(result).toBeNull()
  })

  it('retourne null quand startDate est undefined', async () => {
    const result = await createDayOff(1, undefined, new Date(2025, 3, 10))
    expect(result).toBeNull()
  })

  it('retourne null quand startDate > endDate', async () => {
    const result = await createDayOff(1, new Date(2025, 3, 15), new Date(2025, 3, 10))
    expect(result).toBeNull()
  })

  it('crée un événement quand les dates sont valides', async () => {
    const fakeEvent = { id: 1, name: 'Absence' }
    vi.mocked(db.eventKind.findFirst).mockResolvedValue({ id: 5, key: 'off' })
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent)

    const result = await createDayOff(1, new Date(2025, 3, 8), new Date(2025, 3, 10))
    expect(result).toEqual(fakeEvent)
  })

  it('crée un événement même quand startDate == endDate', async () => {
    const sameDate = new Date(2025, 3, 8)
    const fakeEvent = { id: 2, name: 'Absence' }
    vi.mocked(db.eventKind.findFirst).mockResolvedValue({ id: 5, key: 'off' })
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent)

    const result = await createDayOff(1, sameDate, sameDate)
    expect(result).toEqual(fakeEvent)
  })

  it('crée l\'événement même sans eventKind trouvé', async () => {
    const fakeEvent = { id: 3, name: 'Absence' }
    vi.mocked(db.eventKind.findFirst).mockResolvedValue(null)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent)

    const result = await createDayOff(1, new Date(2025, 3, 8), new Date(2025, 3, 10))
    expect(result).toEqual(fakeEvent)
  })
})
