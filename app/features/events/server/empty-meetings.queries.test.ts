import { beforeEach, describe, expect, it, vi } from 'vitest'

const { countMeetingsToMove, EMPTY_MEETING } = await import('./empty-meetings.queries')

const db = {
  eventTemplate: { findFirst: vi.fn() },
  event: { findMany: vi.fn() },
}
const PARIS = 'Europe/Paris'
const NOW = new Date('2026-11-16T09:00:00Z')
const thursday = { weekDay: 4, startTime: '19:00', endTime: '20:45' }

beforeEach(() => {
  vi.resetAllMocks()
  db.eventTemplate.findFirst.mockResolvedValue(thursday)
})

describe('countMeetingsToMove', () => {
  // Two empty meetings still on the seeded Tuesday; one week already has its programme on Thursday.
  it('counts the empty meetings ahead not at the template’s day and hours, moved or made redundant', async () => {
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

    expect(await countMeetingsToMove(db as never, 6, { congregationId: 1, timeZone: PARIS, now: NOW })).toBe(2)
    expect(db.event.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      templateId: 6,
      congregationId: 1,
      status: 'draft',
      startDate: { gte: NOW },
      ...EMPTY_MEETING,
    })
  })

  it('counts nothing for a template without a day, or that is not there', async () => {
    db.eventTemplate.findFirst.mockResolvedValueOnce({ ...thursday, weekDay: null })
    expect(await countMeetingsToMove(db as never, 6, { congregationId: 1, timeZone: PARIS, now: NOW })).toBe(0)

    db.eventTemplate.findFirst.mockResolvedValueOnce(null)
    expect(await countMeetingsToMove(db as never, 6, { congregationId: 1, timeZone: PARIS, now: NOW })).toBe(0)
    expect(db.event.findMany).not.toHaveBeenCalled()
  })
})
