import { beforeEach, describe, expect, it, vi } from 'vitest'

const audit = vi.fn()
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { RecurringEventsMoved: 'event.recurring_moved' },
  audit: (entry: unknown) => audit(entry),
}))

const { moveEmptyMeetings } = await import('./move-empty-meetings.server')

const db = {
  eventTemplate: { findFirst: vi.fn() },
  event: { findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  $queryRaw: vi.fn(),
}
const CTX = { congregationId: 1, timeZone: 'Europe/Paris', now: new Date('2026-11-16T09:00:00Z'), actorId: 9 }

beforeEach(() => {
  vi.resetAllMocks()
  db.eventTemplate.findFirst.mockResolvedValue({ weekDay: 4, startTime: '19:00', endTime: '20:45' })
  db.event.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(
      where.NOT
        ? [{ startDate: new Date('2026-11-26T18:00:00Z') }]
        : [
            { id: 1, startDate: new Date('2026-11-17T18:00:00Z'), endDate: new Date('2026-11-17T19:45:00Z') },
            { id: 2, startDate: new Date('2026-11-24T18:00:00Z'), endDate: new Date('2026-11-24T19:45:00Z') },
          ],
    ),
  )
})

describe('moveEmptyMeetings', () => {
  it('moves each empty meeting into its week’s new day, and deletes the one whose week already has its meeting', async () => {
    const result = await moveEmptyMeetings(db as never, 6, CTX)

    expect(result).toEqual({ moved: 1, removed: 1 })
    expect(db.event.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 1, congregationId: 1 } },
      data: { startDate: new Date('2026-11-19T18:00:00Z'), endDate: new Date('2026-11-19T19:45:00Z') },
    })
    expect(db.event.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [2] }, congregationId: 1 } })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'event.recurring_moved',
        actorId: 9,
        entityType: 'EventTemplate',
        entityId: 6,
        metadata: { moved: 1, removed: 1 },
      }),
    )
  })

  it('locks the template before reading where its meetings are', async () => {
    const order: string[] = []
    db.$queryRaw.mockImplementation(() => {
      order.push('lock')
      return Promise.resolve([])
    })
    db.eventTemplate.findFirst.mockImplementation(() => {
      order.push('read')
      return Promise.resolve({ weekDay: 4, startTime: '19:00', endTime: '20:45' })
    })

    await moveEmptyMeetings(db as never, 6, CTX)

    expect(order).toEqual(['lock', 'read'])
  })

  it('writes and records nothing when every meeting is already in place', async () => {
    db.event.findMany.mockResolvedValue([])

    expect(await moveEmptyMeetings(db as never, 6, CTX)).toEqual({ moved: 0, removed: 0 })
    expect(db.event.deleteMany).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })
})
