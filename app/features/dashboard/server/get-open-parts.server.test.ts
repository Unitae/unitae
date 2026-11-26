import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { event: { findMany: vi.fn() } } }))

const { getOpenParts } = await import('./get-open-parts.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

describe('getOpenParts', () => {
  it('lists the meetings that still have an empty slot, with how many', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      {
        id: 1,
        name: 'Réunion de semaine',
        startDate: new Date(2026, 10, 12),
        // Its programme is a draft beside published duties: the event reads released (D51), the programme decides.
        status: 'released',
        schedules: [{ status: 'draft' }],
        // Its parts with an open room: one part open in two rooms, so two slots.
        items: [{ rooms: [{ id: 11 }, { id: 12 }] }],
      },
      {
        id: 2,
        name: 'Réunion du week-end',
        startDate: new Date(2026, 10, 15),
        status: 'released',
        schedules: [{ status: 'published' }],
        items: [],
      },
      {
        id: 3,
        name: 'Réunion de semaine',
        startDate: new Date(2026, 10, 19),
        status: 'draft',
        schedules: [{ status: 'published' }],
        items: [{ rooms: [{ id: 31 }] }],
      },
    ] as never)
    const open = await getOpenParts(db, 1, { roleIds: null, days: 28 })
    expect(open).toEqual([
      { eventId: 1, name: 'Réunion de semaine', startDate: new Date(2026, 10, 12), isDraft: true, count: 2 },
      { eventId: 3, name: 'Réunion de semaine', startDate: new Date(2026, 10, 19), isDraft: false, count: 1 },
    ])
  })

  it('finds nothing for someone holding no role, who answers for no schedule', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 1, name: 'x', startDate: new Date(), status: 'draft', items: [{ rooms: [{ id: 1 }] }] },
    ] as never)
    expect(await getOpenParts(db, 1, { roleIds: [], days: 28 })).toEqual([])
  })
})
