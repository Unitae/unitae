import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    eventTemplate: { findFirst: vi.fn() },
    eventPart: { updateMany: vi.fn() },
    eventServiceRole: { updateMany: vi.fn() },
  },
}))

const { createDayOff, deleteDayOff } = await import('./days-off.server')
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
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ id: 5, key: 'day-off' } as never)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent as never)

    const result = await createDayOff(db, 1, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)
    expect(result).toEqual(fakeEvent)
  })

  // Days-off events are not part of the draft/released workflow — they must go
  // live immediately, otherwise the absence-overlap query silently ignores them
  // and the whole conflict-awareness pipeline breaks.
  it('writes status "released" on the created event', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ id: 5, key: 'day-off' } as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1, name: 'Absence' } as never)

    await createDayOff(db, 1, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)

    expect(db.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'released' }) }),
    )
  })

  it('creates an event when startDate == endDate', async () => {
    const sameDate = new Date(2025, 3, 8)
    const fakeEvent = { id: 2, name: 'Absence' }
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ id: 5, key: 'day-off' } as never)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent as never)

    const result = await createDayOff(db, 1, 1, sameDate, sameDate, 1)
    expect(result).toEqual(fakeEvent)
  })

  it('throws NotFoundError when the day-off system template is missing', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(null as never)

    await expect(createDayOff(db, 1, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)).rejects.toThrow(
      'Day-off template',
    )
    expect(db.event.create).not.toHaveBeenCalled()
  })

  it('connects the event to the day-off template when it exists', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ id: 42, key: 'day-off' } as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1 } as never)

    await createDayOff(db, 1, 1, new Date(2025, 3, 8), new Date(2025, 3, 10), 7)

    expect(db.eventTemplate.findFirst).toHaveBeenCalledWith({
      where: { key: 'day-off', congregationId: 7 },
    })
    expect(db.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ template: { connect: { id: 42 } } }),
      }),
    )
  })

  // With a null memberId (account without a linked Member — e.g. circuit
  // overseer or admin), we skip the conflict-flag refresh entirely: there
  // can be no assignments to flag.
  it('skips refreshConflictFlags when memberId is null', async () => {
    const fakeEvent = { id: 4, name: 'Absence' }
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ id: 5, key: 'day-off' } as never)
    vi.mocked(db.event.create).mockResolvedValue(fakeEvent as never)

    await createDayOff(db, 1, null, new Date(2025, 3, 8), new Date(2025, 3, 10), 1)

    expect(db.event.findMany).not.toHaveBeenCalled()
  })
})

describe('deleteDayOff', () => {
  it('deletes the event and returns it', async () => {
    const fakeEvent = { id: 42, startDate: new Date(2025, 3, 8), endDate: new Date(2025, 3, 10) }
    vi.mocked(db.event.delete).mockResolvedValue(fakeEvent as never)

    const result = await deleteDayOff(db, 42, 1, 1)

    expect(result).toEqual(fakeEvent)
    expect(db.event.delete).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 42, congregationId: 1 } },
    })
  })

  it('refreshes conflict flags over the deleted range when memberId is provided', async () => {
    const startDate = new Date(2025, 3, 8)
    const endDate = new Date(2025, 3, 10)
    vi.mocked(db.event.delete).mockResolvedValue({ id: 42, startDate, endDate } as never)

    await deleteDayOff(db, 42, 1, 1)

    expect(db.event.findMany).toHaveBeenCalled()
  })

  // Mirror of createDayOff's null-memberId guard — an account without a
  // linked Member cannot own any conflict-carrying assignments, so refresh
  // is skipped rather than issuing a no-op query.
  it('skips refreshConflictFlags when memberId is null', async () => {
    vi.mocked(db.event.delete).mockResolvedValue({
      id: 42,
      startDate: new Date(2025, 3, 8),
      endDate: new Date(2025, 3, 10),
    } as never)

    await deleteDayOff(db, 42, null, 1)

    expect(db.event.findMany).not.toHaveBeenCalled()
  })
})
