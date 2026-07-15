import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    eventKind: { findFirst: vi.fn() },
    programmePartAssignment: { updateMany: vi.fn() },
    programmeServiceRoleAssignment: { updateMany: vi.fn() },
  },
}))

const { createDayOff } = await import('./days-off.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  // Default: no overlapping programme events for conflict refresh
  vi.mocked(db.event.findMany).mockResolvedValue([] as never)
})

describe('createDayOff', () => {
  it('returns null when startDate is null', async () => {
    const result = await createDayOff(db, 1, 1, null, new Date(2025, 3, 10), 1)
    expect(result).toBeNull()
  })

  it('returns null when endDate is null', async () => {
    const result = await createDayOff(db, 1, 1, new Date(2025, 3, 8), null, 1)
    expect(result).toBeNull()
  })

  it('returns null when startDate is undefined', async () => {
    const result = await createDayOff(db, 1, 1, undefined, new Date(2025, 3, 10), 1)
    expect(result).toBeNull()
  })

  it('returns null when startDate > endDate', async () => {
    const result = await createDayOff(db, 1, 1, new Date(2025, 3, 15), new Date(2025, 3, 10), 1)
    expect(result).toBeNull()
  })

  it('creates an event when dates are valid', async () => {
    const fakeEvent = { id: 1, name: 'Absence' }
    vi.mocked(db.eventKind.findFirst).mockResolvedValue({ id: 5, key: 'off' } as never)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent as never)

    const result = await createDayOff(db, 1, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)
    expect(result).toEqual(fakeEvent)
  })

  it('creates an event when startDate == endDate', async () => {
    const sameDate = new Date(2025, 3, 8)
    const fakeEvent = { id: 2, name: 'Absence' }
    vi.mocked(db.eventKind.findFirst).mockResolvedValue({ id: 5, key: 'off' } as never)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent as never)

    const result = await createDayOff(db, 1, 1, sameDate, sameDate, 1)
    expect(result).toEqual(fakeEvent)
  })

  it('creates the event even when no eventKind is found', async () => {
    const fakeEvent = { id: 3, name: 'Absence' }
    vi.mocked(db.eventKind.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent as never)

    const result = await createDayOff(db, 1, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)
    expect(result).toEqual(fakeEvent)
  })

  // With a null memberId (account without a linked Member — e.g. circuit
  // overseer or admin), we skip the conflict-flag refresh entirely: there
  // can be no assignments to flag.
  it('skips refreshConflictFlags when memberId is null', async () => {
    const fakeEvent = { id: 4, name: 'Absence' }
    vi.mocked(db.eventKind.findFirst).mockResolvedValue({ id: 5, key: 'off' } as never)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent as never)

    await createDayOff(db, 1, null, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)

    expect(db.event.findMany).not.toHaveBeenCalled()
  })
})
