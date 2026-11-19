import { beforeEach, describe, expect, it, vi } from 'vitest'

const audit = vi.fn()
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { RecurringEventsCreated: 'event.recurring_created' },
  auditInTransaction: (_db: unknown, entry: unknown) => audit(entry),
}))
const logError = vi.fn()
vi.mock('~/shared/infra/logger.server', () => ({ createLogger: () => ({ error: logError, info: vi.fn() }) }))

const mockDb = {
  eventTemplate: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  event: { findFirst: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), update: vi.fn() },
  $queryRaw: vi.fn(),
}

const { extendRecurringEvents, reanchorEmptyMeetings } = await import('./recurring-events.server')

const PARIS = 'Europe/Paris'
// Monday 16 November 2026, 02:00 in Paris.
const NOW = new Date('2026-11-16T01:00:00Z')
const thursday = { id: 6, name: 'Réunion de semaine', weekDay: 4, startTime: '19:00', endTime: '20:45' }
// The rows the job reads again after locking each template, and the mark they carry.
let rows = new Map<number, object>([[6, thursday]])
let mark: string | null = '2026-12-31'

beforeEach(() => {
  vi.resetAllMocks()
  rows = new Map<number, object>([[6, thursday]])
  mockDb.eventTemplate.findMany.mockResolvedValue([thursday])
  mockDb.eventTemplate.findFirst.mockImplementation(({ where }: { where: { id: number } }) =>
    Promise.resolve({ ...rows.get(where.id), generatedUntil: mark }),
  )
  mark = '2026-12-31'
  mockDb.event.findFirst.mockResolvedValue(null)
  mockDb.event.findMany.mockResolvedValue([])
  mockDb.event.createMany.mockResolvedValue({ count: 2 })
  mockDb.$queryRaw.mockResolvedValue([])
})

describe('extendRecurringEvents', () => {
  it('looks only at templates with a weekday, never at the system ones', async () => {
    await extendRecurringEvents(mockDb as never, { congregationId: 1, timeZone: PARIS, now: NOW })

    const [[{ where, orderBy }]] = mockDb.eventTemplate.findMany.mock.calls
    expect(where).toEqual({
      congregationId: 1,
      weekDay: { not: null },
      key: { notIn: ['freeform'] },
    })
    // In id order, like series creation, so the two never wait on each other in a cycle.
    expect(orderBy).toEqual({ id: 'asc' })
  })

  it('creates bare draft events with no author at the template’s local hours, up to two months ahead', async () => {
    const created = await extendRecurringEvents(mockDb as never, { congregationId: 1, timeZone: PARIS, now: NOW })

    const [[{ data }]] = mockDb.event.createMany.mock.calls
    expect(data).toEqual([
      {
        name: 'Réunion de semaine',
        templateId: 6,
        startDate: new Date('2027-01-07T18:00:00Z'),
        endDate: new Date('2027-01-07T19:45:00Z'),
        status: 'draft',
        createdById: null,
        origin: 'job',
        congregationId: 1,
      },
      {
        name: 'Réunion de semaine',
        templateId: 6,
        startDate: new Date('2027-01-14T18:00:00Z'),
        endDate: new Date('2027-01-14T19:45:00Z'),
        status: 'draft',
        createdById: null,
        origin: 'job',
        congregationId: 1,
      },
    ])
    expect(created).toBe(2)
  })

  it('locks the template before reading its mark, so a series being created at the same moment cannot double a day', async () => {
    const order: string[] = []
    mockDb.$queryRaw.mockImplementation(() => {
      order.push('lock')
      return Promise.resolve([])
    })
    mockDb.eventTemplate.findFirst.mockImplementation(() => {
      order.push('mark')
      return Promise.resolve({ ...thursday, generatedUntil: '2026-12-31' })
    })

    await extendRecurringEvents(mockDb as never, { congregationId: 1, timeZone: PARIS, now: NOW })

    expect(order).toEqual(['lock', 'mark'])
  })

  it('raises the template’s mark to the horizon', async () => {
    await extendRecurringEvents(mockDb as never, { congregationId: 1, timeZone: PARIS, now: NOW })

    expect(mockDb.eventTemplate.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 6, congregationId: 1 } },
      data: { generatedUntil: '2027-01-16' },
    })
  })

  it('starts after the last event on the first run', async () => {
    mark = null
    mockDb.event.findFirst.mockResolvedValue({ startDate: new Date('2027-01-07T18:00:00Z') })

    await extendRecurringEvents(mockDb as never, { congregationId: 1, timeZone: PARIS, now: NOW })

    const [[{ data }]] = mockDb.event.createMany.mock.calls
    expect(data.map((event: { startDate: Date }) => event.startDate)).toEqual([new Date('2027-01-14T18:00:00Z')])
  })

  it('skips a day that already has an event of the template', async () => {
    mockDb.event.findMany.mockResolvedValue([{ startDate: new Date('2027-01-07T18:00:00Z') }])

    await extendRecurringEvents(mockDb as never, { congregationId: 1, timeZone: PARIS, now: NOW })

    const [[{ data }]] = mockDb.event.createMany.mock.calls
    expect(data).toHaveLength(1)
  })

  // An edit committed while the job waited on the lock wins: the job uses the row it reads after the lock.
  it('creates on the weekday the template has after the lock, and nothing for a template that lost it', async () => {
    rows = new Map<number, object>([[6, { ...thursday, weekDay: null }]])

    expect(await extendRecurringEvents(mockDb as never, { congregationId: 1, timeZone: PARIS, now: NOW })).toBe(0)
    expect(mockDb.event.createMany).not.toHaveBeenCalled()
  })

  it('records one system entry per template that got events, and none otherwise', async () => {
    await extendRecurringEvents(mockDb as never, { congregationId: 1, timeZone: PARIS, now: NOW })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'event.recurring_created',
        congregationId: 1,
        entityType: 'EventTemplate',
        entityId: 6,
        metadata: { count: 2 },
      }),
    )
    expect(audit.mock.calls[0][0].actorId).toBeUndefined()

    audit.mockClear()
    mark = '2027-01-16'
    await extendRecurringEvents(mockDb as never, { congregationId: 1, timeZone: PARIS, now: NOW })
    expect(audit).not.toHaveBeenCalled()
    expect(mockDb.event.createMany).toHaveBeenCalledTimes(1)
  })

  it('skips a template whose hours are not readable, says which, and still serves the others', async () => {
    rows = new Map<number, object>([
      [5, { ...thursday, id: 5, startTime: '7pm' }],
      [6, thursday],
    ])
    mockDb.eventTemplate.findMany.mockResolvedValue([{ id: 5 }, { id: 6 }])

    const created = await extendRecurringEvents(mockDb as never, { congregationId: 1, timeZone: PARIS, now: NOW })

    expect(created).toBe(2)
    expect(logError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ templateId: 5 }))
  })
})

describe('reanchorEmptyMeetings', () => {
  it('moves the empty meetings created ahead to the same local day and hours in the new zone', async () => {
    // Created at 19:00 Paris on Thursday 19 November; the congregation is in fact in Réunion (UTC+4).
    mockDb.event.findMany.mockResolvedValue([
      { id: 40, startDate: new Date('2026-11-19T18:00:00Z'), template: { startTime: '19:00', endTime: '20:45' } },
    ])

    await reanchorEmptyMeetings(mockDb as never, {
      congregationId: 1,
      previousTimeZone: PARIS,
      timeZone: 'Indian/Reunion',
      now: NOW,
    })

    const [[{ where }]] = mockDb.event.findMany.mock.calls
    expect(where).toMatchObject({
      congregationId: 1,
      origin: 'job',
      eventParts: { none: {} },
      eventServiceParts: { none: {} },
      attendance: { is: null },
    })
    expect(mockDb.event.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 40, congregationId: 1 } },
      data: { startDate: new Date('2026-11-19T15:00:00Z'), endDate: new Date('2026-11-19T16:45:00Z') },
    })
  })
})
