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
        status: 'draft',
        _count: { items: 2 },
      },
      {
        id: 2,
        name: 'Réunion du week-end',
        startDate: new Date(2026, 10, 15),
        status: 'released',
        _count: { items: 0 },
      },
    ] as never)
    const open = await getOpenParts(db, 1, { roleIds: null, days: 28 })
    expect(open).toEqual([
      { eventId: 1, name: 'Réunion de semaine', startDate: new Date(2026, 10, 12), isDraft: true, count: 2 },
    ])
  })

  it('finds nothing for someone holding no role, who answers for no schedule', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 1, name: 'x', startDate: new Date(), status: 'draft', _count: { items: 2 } },
    ] as never)
    expect(await getOpenParts(db, 1, { roleIds: [], days: 28 })).toEqual([])
  })
})
