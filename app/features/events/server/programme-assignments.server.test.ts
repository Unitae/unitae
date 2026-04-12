import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    event: { findFirst: vi.fn(), findMany: vi.fn() },
    programmePartAssignment: { upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    programmeServiceRoleAssignment: { upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}))

const { assignPart, assignServiceRole, unassignPart, unassignServiceRole, checkDayOffConflict, refreshConflictFlags } =
  await import('./programme-assignments.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
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
  it('blocks assignment when assignee has a day-off conflict', async () => {
    // First call: get event, second call: check conflict
    vi.mocked(db.event.findFirst)
      .mockResolvedValueOnce({ id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) } as never)
      .mockResolvedValueOnce({ id: 99 } as never) // day-off found

    const result = await assignPart(db, 1, 10, 5, null, 'Topic', 1)
    expect(result).toHaveProperty('error')
  })

  it('creates assignment when no conflict', async () => {
    vi.mocked(db.event.findFirst)
      .mockResolvedValueOnce({ id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) } as never)
      .mockResolvedValueOnce(null as never) // no day-off
    vi.mocked(db.programmePartAssignment.upsert).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignPart(db, 1, 10, 5, null, 'Topic', 1)
    expect(result).toHaveProperty('assignment')
  })

  it('allows assignment with null assigneeId (unassign)', async () => {
    vi.mocked(db.programmePartAssignment.upsert).mockResolvedValue({ id: 1, assigneeId: null } as never)

    const result = await assignPart(db, 1, 10, null, null, '', 1)
    expect(result).toHaveProperty('assignment')
  })

  it('blocks assignment when assistant has a day-off conflict', async () => {
    // assigneeId is null, so skip first conflict check
    // Then check assistant conflict
    vi.mocked(db.event.findFirst)
      .mockResolvedValueOnce({ id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) } as never)
      .mockResolvedValueOnce({ id: 99 } as never) // assistant day-off found

    const result = await assignPart(db, 1, 10, null, 8, 'Topic', 1)
    expect(result).toHaveProperty('error')
  })
})

describe('assignServiceRole', () => {
  it('blocks assignment when assignee has a day-off conflict', async () => {
    vi.mocked(db.event.findFirst)
      .mockResolvedValueOnce({ id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) } as never)
      .mockResolvedValueOnce({ id: 99 } as never)

    const result = await assignServiceRole(db, 1, 20, 5, 1)
    expect(result).toHaveProperty('error')
  })

  it('creates assignment when no conflict', async () => {
    vi.mocked(db.event.findFirst)
      .mockResolvedValueOnce({ id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) } as never)
      .mockResolvedValueOnce(null as never)
    vi.mocked(db.programmeServiceRoleAssignment.upsert).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignServiceRole(db, 1, 20, 5, 1)
    expect(result).toHaveProperty('assignment')
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
    // checkDayOffConflict call
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
