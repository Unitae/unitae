import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findFirst: vi.fn(), findMany: vi.fn() },
    programmePartAssignment: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    programmeServiceRoleAssignment: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    externalSpeaker: { findFirst: vi.fn() },
  },
}))

vi.mock('~/features/events/server/allowed-roles.server', () => ({
  getPartAssignmentAllowedRoleIds: vi.fn().mockResolvedValue([]),
  getServiceRoleAssignmentAllowedRoleIds: vi.fn().mockResolvedValue([]),
  resolveEligibleUserIds: vi.fn().mockResolvedValue([5]),
}))

const { assignPart, assignServiceRole, unassignPart, unassignServiceRole, checkDayOffConflict, refreshConflictFlags } =
  await import('./programme-assignments.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const allowedRoles = await import('~/features/events/server/allowed-roles.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(allowedRoles.getPartAssignmentAllowedRoleIds).mockResolvedValue([])
  vi.mocked(allowedRoles.getServiceRoleAssignmentAllowedRoleIds).mockResolvedValue([])
  // Default eligibility list contains user 5 — the user used by most existing tests.
  vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValue([5])
})

describe('checkDayOffConflict', () => {
  it('returns true when a day-off overlaps', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 1 } as never)
    const result = await checkDayOffConflict(db, 1, new Date(2026, 3, 14), new Date(2026, 3, 14), 1)
    expect(result).toBe(true)
  })

  it('returns false when no day-off overlaps', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    const result = await checkDayOffConflict(db, 1, new Date(2026, 3, 14), new Date(2026, 3, 14), 1)
    expect(result).toBe(false)
  })
})

describe('assignPart', () => {
  it('returns error when assignment not found', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue(null as never)
    const result = await assignPart(db, 999, 5, null, null, 'Topic', 1)
    expect(result).toHaveProperty('error')
  })

  it('blocks assignment when assignee has a day-off conflict', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never) // day-off found

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)
    expect(result).toHaveProperty('error')
  })

  it('updates assignment when no conflict', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never) // no day-off
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)
    expect(result).toHaveProperty('assignment')
  })

  it('allows null assigneeId', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1, assigneeId: null } as never)

    const result = await assignPart(db, 1, null, null, null, '', 1)
    expect(result).toHaveProperty('assignment')
  })

  it('rejects when speaker is not in the eligible role set', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(allowedRoles.getPartAssignmentAllowedRoleIds).mockResolvedValueOnce([99])
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValueOnce([42]) // not user 5

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)
    expect(result).toHaveProperty('error')
    expect(db.programmePartAssignment.update).not.toHaveBeenCalled()
  })

  it('rejects when reader is not in the eligible role set', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    // Speaker fetch (asKind: 'speaker') → empty allowed → publisher fallback returning [5]
    // Reader fetch (asKind: 'reader')  → restrictive list, eligible = [42]
    vi.mocked(allowedRoles.getPartAssignmentAllowedRoleIds).mockResolvedValueOnce([]).mockResolvedValueOnce([99])
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValueOnce([5]).mockResolvedValueOnce([42])
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)

    const result = await assignPart(db, 1, 5, 7, null, 'Topic', 1)
    expect(result).toHaveProperty('error')
  })

  it('skips eligibility checks for external speakers', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.externalSpeaker.findFirst).mockResolvedValue({
      id: 99,
      name: 'External Bob',
    } as never)
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1, externalSpeakerId: 99 } as never)

    const result = await assignPart(db, 1, null, null, 99, 'Topic', 1)

    expect(result).toHaveProperty('assignment')
    expect(allowedRoles.resolveEligibleUserIds).not.toHaveBeenCalled()
  })

  // Wave 1 bug 4 — regression test.
  // The same person used to be assignable as both speaker (assigneeId) and
  // reader (assistantId) of the same programme part, because each was
  // validated independently for role eligibility and day-off conflict but
  // never compared to the other.
  it('rejects when the same person is assigned as both speaker and reader', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValue([5])

    const result = await assignPart(db, 1, 5, 5, null, 'Topic', 1)

    expect(result).toHaveProperty('error')
    expect(db.programmePartAssignment.update).not.toHaveBeenCalled()
  })
})

describe('assignServiceRole', () => {
  it('returns error when assignment not found', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue(null as never)
    const result = await assignServiceRole(db, 999, 5, 1)
    expect(result).toHaveProperty('error')
  })

  it('blocks assignment when assignee has a day-off conflict', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never)

    const result = await assignServiceRole(db, 1, 5, 1)
    expect(result).toHaveProperty('error')
  })

  it('updates assignment when no conflict', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.programmeServiceRoleAssignment.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignServiceRole(db, 1, 5, 1)
    expect(result).toHaveProperty('assignment')
  })

  it('rejects when assignee is not in the eligible role set', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(allowedRoles.getServiceRoleAssignmentAllowedRoleIds).mockResolvedValueOnce([99])
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValueOnce([42])

    const result = await assignServiceRole(db, 1, 5, 1)
    expect(result).toHaveProperty('error')
    expect(db.programmeServiceRoleAssignment.update).not.toHaveBeenCalled()
  })
})

describe('unassignPart', () => {
  it('resets assignee to null', async () => {
    const updated = { id: 1, assigneeId: null, hasConflict: false }
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue(updated as never)

    const result = await unassignPart(db, 1, 1)
    expect(result).toEqual(updated)
  })
})

describe('unassignServiceRole', () => {
  it('resets assignee to null', async () => {
    const updated = { id: 1, assigneeId: null, hasConflict: false }
    vi.mocked(db.programmeServiceRoleAssignment.update).mockResolvedValue(updated as never)

    const result = await unassignServiceRole(db, 1, 1)
    expect(result).toEqual(updated)
  })
})

describe('refreshConflictFlags', () => {
  it('updates conflict flags for overlapping events', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    ] as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never)
    vi.mocked(db.programmePartAssignment.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(db.programmeServiceRoleAssignment.updateMany).mockResolvedValue({ count: 0 } as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    expect(db.programmePartAssignment.updateMany).toHaveBeenCalled()
    expect(db.programmeServiceRoleAssignment.updateMany).toHaveBeenCalled()
  })

  it('does nothing when no overlapping events', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    expect(db.programmePartAssignment.updateMany).not.toHaveBeenCalled()
  })
})
