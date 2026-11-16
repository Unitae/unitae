import { beforeEach, describe, expect, it, vi } from 'vitest'

const audit = vi.fn()
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { RecurringEventsCreated: 'event.recurring_created' },
  audit: (...args: unknown[]) => audit(...args),
}))

const mockDb = {
  eventTemplate: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  event: { findFirst: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
  $queryRaw: vi.fn(),
}

const { extendRecurringEvents } = await import('./recurring-events.server')

const PARIS = 'Europe/Paris'
// Monday 16 November 2026, 02:00 in Paris.
const NOW = new Date('2026-11-16T01:00:00Z')
const thursday = { id: 6, name: 'Réunion de semaine', weekDay: 4, startTime: '19:00', endTime: '20:45' }

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.eventTemplate.findMany.mockResolvedValue([thursday])
  mockDb.eventTemplate.findFirst.mockResolvedValue({ generatedUntil: '2026-12-31' })
  mockDb.event.findFirst.mockResolvedValue(null)
  mockDb.event.findMany.mockResolvedValue([])
  mockDb.event.createMany.mockResolvedValue({ count: 2 })
  mockDb.$queryRaw.mockResolvedValue([])
})

describe('extendRecurringEvents', () => {
  it('looks only at templates with a weekday, never at the system ones', async () => {
    await extendRecurringEvents(mockDb as never, { congregationId: 1, timeZone: PARIS, now: NOW })

    const [[{ where }]] = mockDb.eventTemplate.findMany.mock.calls
    expect(where).toEqual({
      congregationId: 1,
      weekDay: { not: null },
      key: { notIn: ['day-off', 'freeform'] },
    })
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
        congregationId: 1,
      },
      {
        name: 'Réunion de semaine',
        templateId: 6,
        startDate: new Date('2027-01-14T18:00:00Z'),
        endDate: new Date('2027-01-14T19:45:00Z'),
        status: 'draft',
        createdById: null,
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
      return Promise.resolve({ generatedUntil: '2026-12-31' })
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
    mockDb.eventTemplate.findFirst.mockResolvedValue({ generatedUntil: null })
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
    mockDb.eventTemplate.findFirst.mockResolvedValue({ generatedUntil: '2027-01-16' })
    await extendRecurringEvents(mockDb as never, { congregationId: 1, timeZone: PARIS, now: NOW })
    expect(audit).not.toHaveBeenCalled()
    expect(mockDb.event.createMany).toHaveBeenCalledTimes(1)
  })
})
