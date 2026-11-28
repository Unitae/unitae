import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', async () => {
  const { withItemMock } = await import('~/tests/helpers/item-mock')
  return {
    unscopedDb: withItemMock({
      eventPart: { findMany: vi.fn() },
      eventServicePart: { findMany: vi.fn() },
    }),
  }
})

const { listUserSameEventAssignments } = await import('./list-user-same-event-assignments.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.eventPart.findMany).mockResolvedValue([] as never)
  vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)
})

describe('listUserSameEventAssignments', () => {
  // The part being edited is left out for its room being edited only (parallel rooms): held in another of its rooms,
  // it is another assignment.
  const row = (roomId: number, key: string | null, assigneeId: number | null) => ({
    roomId,
    assigneeId,
    assistantId: null,
    room: { key },
  })
  const parts = [
    { id: 42, name: 'Lecture', section: 'Ministère', rooms: [row(1, 'main', 5), row(2, null, 6)] },
    { id: 43, name: 'Prière', section: 'Ministère', rooms: [row(3, 'main', 5)] },
  ]

  it('leaves out the part being edited when the person holds it in that room only', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue(parts as never)
    const result = await listUserSameEventAssignments(db, {
      userId: 5,
      eventId: 10,
      congregationId: 1,
      excludePartAssignmentId: 42,
    })
    expect(result.map(each => each.name)).toEqual(['Prière'])
  })

  it('keeps the part being edited when the person holds another of its rooms', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue(parts as never)
    const result = await listUserSameEventAssignments(db, {
      userId: 5,
      eventId: 10,
      congregationId: 1,
      excludePartAssignmentId: 42,
      roomId: 2,
    })
    expect(result.map(each => each.name)).toEqual(['Lecture', 'Prière'])
  })

  it('keeps every part when no part is being edited', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue(parts as never)
    const result = await listUserSameEventAssignments(db, { userId: 5, eventId: 10, congregationId: 1 })
    expect(result.map(each => each.name)).toEqual(['Lecture', 'Prière'])
  })

  it('excludes the given service assignment id from the service query when provided', async () => {
    await listUserSameEventAssignments(db, {
      userId: 5,
      eventId: 10,
      congregationId: 1,
      excludeServiceAssignmentId: 77,
    })

    const call = vi.mocked(db.eventServicePart.findMany).mock.calls[0][0]
    expect(call?.where).toMatchObject({ NOT: { id: 77 } })
  })

  it('does not filter the service query when excludeServiceAssignmentId is omitted', async () => {
    await listUserSameEventAssignments(db, { userId: 5, eventId: 10, congregationId: 1 })

    const call = vi.mocked(db.eventServicePart.findMany).mock.calls[0][0]
    expect(call?.where).not.toHaveProperty('NOT')
  })

  it('returns parts tagged "part" and services tagged "service", parts first', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([{ id: 1, name: 'Reading', section: 'Ministry' }] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([{ id: 2, name: 'Sound' }] as never)

    const result = await listUserSameEventAssignments(db, { userId: 5, eventId: 10, congregationId: 1 })

    expect(result).toEqual([
      { type: 'part', name: 'Reading', section: 'Ministry' },
      { type: 'service', name: 'Sound' },
    ])
  })
})
