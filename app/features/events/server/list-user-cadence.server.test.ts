import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findMany: vi.fn() },
  },
}))

const { listUserCadence } = await import('./list-user-cadence.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const NOW = new Date('2026-07-19T00:00:00.000Z')
const DEFAULT_ARGS = {
  userId: 5,
  event: { templateId: 42 as number | null, id: 100, startDate: NOW },
  congregationId: 1,
  partName: 'Bible Reading',
  pastCount: 6,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.event.findMany).mockResolvedValue([] as never)
})

describe('listUserCadence', () => {
  it('short-circuits with empty arrays when templateId is null (freeform event)', async () => {
    const result = await listUserCadence(db, { ...DEFAULT_ARGS, event: { ...DEFAULT_ARGS.event, templateId: null } })

    expect(result).toEqual({ past: [], future: [] })
    expect(db.event.findMany).not.toHaveBeenCalled()
  })

  it('queries past events by templateId + congregationId with startDate < currentEvent.startDate', async () => {
    await listUserCadence(db, DEFAULT_ARGS)

    const pastCall = vi.mocked(db.event.findMany).mock.calls[0][0]
    expect(pastCall?.where).toMatchObject({
      templateId: 42,
      congregationId: 1,
      startDate: { lt: NOW },
    })
  })

  it('orders past events by startDate desc and caps at pastCount', async () => {
    await listUserCadence(db, DEFAULT_ARGS)

    const pastCall = vi.mocked(db.event.findMany).mock.calls[0][0]
    expect(pastCall?.orderBy).toEqual({ startDate: 'desc' })
    expect(pastCall?.take).toBe(6)
  })

  it('queries future events by templateId + congregationId with startDate > currentEvent.startDate', async () => {
    await listUserCadence(db, DEFAULT_ARGS)

    const futureCall = vi.mocked(db.event.findMany).mock.calls[1][0]
    expect(futureCall?.where).toMatchObject({
      templateId: 42,
      congregationId: 1,
      startDate: { gt: NOW },
    })
  })

  it('orders future events by startDate asc with no take (uncapped)', async () => {
    await listUserCadence(db, DEFAULT_ARGS)

    const futureCall = vi.mocked(db.event.findMany).mock.calls[1][0]
    expect(futureCall?.orderBy).toEqual({ startDate: 'asc' })
    expect(futureCall?.take).toBeUndefined()
  })

  it('reverses the past query result so entries flow oldest → newest', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        // Prisma returned newest-first (desc)
        { id: 3, startDate: new Date('2026-06-01'), partAssignments: [] },
        { id: 2, startDate: new Date('2026-05-01'), partAssignments: [] },
        { id: 1, startDate: new Date('2026-04-01'), partAssignments: [] },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past.map(e => e.date)).toEqual([
      new Date('2026-04-01').toISOString(),
      new Date('2026-05-01').toISOString(),
      new Date('2026-06-01').toISOString(),
    ])
  })

  it('marks assigned=true when the user is the part assignee', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        { id: 1, startDate: new Date('2026-04-01'), partAssignments: [{ assigneeId: 5, assistantId: null }] },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(true)
  })

  it('marks assigned=true when the user is the part assistant', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        { id: 1, startDate: new Date('2026-04-01'), partAssignments: [{ assigneeId: 99, assistantId: 5 }] },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(true)
  })

  it('marks assigned=false when neither slot is the user', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        { id: 1, startDate: new Date('2026-04-01'), partAssignments: [{ assigneeId: 99, assistantId: 42 }] },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
  })

  it('marks assigned=false when the event has no matching part assignment', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([{ id: 1, startDate: new Date('2026-04-01'), partAssignments: [] }] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
  })

  it('filters the included partAssignments by name so only the matching part is checked', async () => {
    await listUserCadence(db, DEFAULT_ARGS)

    const pastCall = vi.mocked(db.event.findMany).mock.calls[0][0]
    const partsInclude = (pastCall?.select as { partAssignments?: { where?: unknown } } | undefined)?.partAssignments
    expect(partsInclude).toMatchObject({ where: { name: 'Bible Reading' } })
  })

  it('returns both past and future entries in the expected shape', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        { id: 1, startDate: new Date('2026-04-01'), partAssignments: [{ assigneeId: 5, assistantId: null }] },
      ] as never)
      .mockResolvedValueOnce([
        { id: 2, startDate: new Date('2026-08-01'), partAssignments: [{ assigneeId: 99, assistantId: null }] },
      ] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result).toEqual({
      past: [{ date: new Date('2026-04-01').toISOString(), assigned: true }],
      future: [{ date: new Date('2026-08-01').toISOString(), assigned: false }],
    })
  })
})
