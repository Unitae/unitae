import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    programmePartAssignment: { findMany: vi.fn() },
    programmeServiceRoleAssignment: { findMany: vi.fn() },
  },
}))

const { listUserSameEventAssignments } = await import('./list-user-same-event-assignments.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([] as never)
  vi.mocked(db.programmeServiceRoleAssignment.findMany).mockResolvedValue([] as never)
})

describe('listUserSameEventAssignments', () => {
  it('excludes the given part assignment id from the part query when provided', async () => {
    await listUserSameEventAssignments(db, {
      userId: 5,
      eventId: 10,
      congregationId: 1,
      excludePartAssignmentId: 42,
    })

    const call = vi.mocked(db.programmePartAssignment.findMany).mock.calls[0][0]
    expect(call?.where).toMatchObject({ id: { not: 42 } })
  })

  it('does not filter the part query when excludePartAssignmentId is omitted', async () => {
    await listUserSameEventAssignments(db, { userId: 5, eventId: 10, congregationId: 1 })

    const call = vi.mocked(db.programmePartAssignment.findMany).mock.calls[0][0]
    expect(call?.where).not.toHaveProperty('id')
  })

  it('excludes the given service assignment id from the service query when provided', async () => {
    await listUserSameEventAssignments(db, {
      userId: 5,
      eventId: 10,
      congregationId: 1,
      excludeServiceAssignmentId: 77,
    })

    const call = vi.mocked(db.programmeServiceRoleAssignment.findMany).mock.calls[0][0]
    expect(call?.where).toMatchObject({ id: { not: 77 } })
  })

  it('does not filter the service query when excludeServiceAssignmentId is omitted', async () => {
    await listUserSameEventAssignments(db, { userId: 5, eventId: 10, congregationId: 1 })

    const call = vi.mocked(db.programmeServiceRoleAssignment.findMany).mock.calls[0][0]
    expect(call?.where).not.toHaveProperty('id')
  })

  it('returns parts tagged "part" and services tagged "service", parts first', async () => {
    vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([
      { id: 1, name: 'Reading', section: 'Ministry' },
    ] as never)
    vi.mocked(db.programmeServiceRoleAssignment.findMany).mockResolvedValue([{ id: 2, name: 'Sound' }] as never)

    const result = await listUserSameEventAssignments(db, { userId: 5, eventId: 10, congregationId: 1 })

    expect(result).toEqual([
      { type: 'part', name: 'Reading', section: 'Ministry' },
      { type: 'service', name: 'Sound' },
    ])
  })
})
