import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProgrammeTemplateKey } from '~/features/events/model/programme-template.type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findFirst: vi.fn(), findMany: vi.fn() },
    programmePartAssignment: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    programmeServiceRoleAssignment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    externalSpeaker: { findFirst: vi.fn() },
    // Row-lock helper stub — real SQL under integration tests, no-op in unit tests.
    $executeRaw: vi.fn().mockResolvedValue(0),
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

// Matches the shared "absence" copy in DAY_OFF_MESSAGE without pinning the
// exact French string, so a wording tweak in the policy file doesn't force a
// test churn (the policy test already pins the exact strings).
const DAY_OFF_MESSAGE_PATTERN = /absence/i

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

  // Regression pin — the ID passed in is a Member.id (all call sites resolve
  // participants via Member); day-off events store the creator's UserAccount.id
  // in Event.createdById. Filtering by `createdBy: { memberId }` is the only
  // shape that correctly joins the two. A prior version filtered by
  // `createdById: memberId` which silently returned no results whenever the
  // member's linked account.id differed from the member.id.
  it('joins day-offs through Event.createdBy.memberId (not createdById)', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    const memberId = 5000

    await checkDayOffConflict(db, memberId, new Date(2026, 3, 14), new Date(2026, 3, 14), 1)

    const firstCall = vi.mocked(db.event.findFirst).mock.calls[0][0]
    const where = firstCall?.where as Record<string, unknown>
    expect(where.createdBy).toEqual({ memberId })
    expect(where).not.toHaveProperty('createdById')
  })
})

describe('assignPart', () => {
  it('returns error when assignment not found', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue(null as never)
    const result = await assignPart(db, 999, 5, null, null, 'Topic', 1)
    expect(result).toHaveProperty('error')
  })

  it('acquires a row lock on the assignment before reading it', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1 } as never)

    await assignPart(db, 1, 5, null, null, 'Topic', 1)

    // $executeRaw MUST fire before findFirst — the lock is the whole point.
    // Assert order via mock.invocationCallOrder.
    const lockOrder = vi.mocked(db.$executeRaw).mock.invocationCallOrder[0]
    const findOrder = vi.mocked(db.programmePartAssignment.findFirst).mock.invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(findOrder)
  })

  // Day-off conflicts no longer block the save — the manager needs to be able
  // to draft a schedule freely. The conflict surfaces as hasConflict=true on
  // the assignment and blocks the event's release step downstream.
  it('saves assignment with hasConflict=true when assignee has a day-off conflict', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never) // day-off found
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)

    expect(result).toHaveProperty('assignment')
    const updateCall = vi.mocked(db.programmePartAssignment.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: true })
  })

  // Symmetric — assistant absent, speaker fine → still saves with hasConflict=true.
  it('saves assignment with hasConflict=true when assistant has a day-off conflict', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    // Both participants must be in the eligible role set so the writer reaches
    // the day-off checks rather than short-circuiting on eligibility.
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValue([5, 7])
    // Speaker check: no day-off. Assistant check: day-off found.
    vi.mocked(db.event.findFirst)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ id: 99 } as never)
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1 } as never)

    await assignPart(db, 1, 5, 7, null, 'Topic', 1)

    const updateCall = vi.mocked(db.programmePartAssignment.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: true })
  })

  it('updates assignment with hasConflict=false when no conflict', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never) // no day-off
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)
    expect(result).toHaveProperty('assignment')
    const updateCall = vi.mocked(db.programmePartAssignment.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: false })
  })

  // Regression pin: draft events accept conflicting assignments (the schedule
  // is still being built); released events must NOT — a manager scheduling
  // over a known absence on a public event is silent scheduling breakage.
  it('BLOCKS assignPart on a RELEASED event when the speaker has a day-off conflict', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { status: 'released', startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never) // day-off found

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)

    expect(result).toEqual({ error: expect.stringMatching(DAY_OFF_MESSAGE_PATTERN) })
    expect(db.programmePartAssignment.update).not.toHaveBeenCalled()
  })

  it('BLOCKS assignPart on a RELEASED event when the reader has a day-off conflict', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { status: 'released', startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValue([5, 7])
    // Speaker: no day-off. Reader: day-off found.
    vi.mocked(db.event.findFirst)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ id: 99 } as never)

    const result = await assignPart(db, 1, 5, 7, null, 'Topic', 1)

    expect(result).toEqual({ error: expect.stringMatching(DAY_OFF_MESSAGE_PATTERN) })
    expect(db.programmePartAssignment.update).not.toHaveBeenCalled()
  })

  it('still saves with hasConflict=true on a DRAFT event when a day-off conflict exists', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { status: 'draft', startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never)
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)

    expect(result).toHaveProperty('assignment')
    const updateCall = vi.mocked(db.programmePartAssignment.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: true })
  })

  // Consumers (route + notification path) need to diff the old assignee vs
  // the new one to decide who to notify. Returning the previous IDs alongside
  // the new assignment keeps the diff logic out of the route.
  it('returns the previous assigneeId and assistantId on success', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: 8,
      assistantId: 9,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)
    expect(result).toMatchObject({ previousAssigneeId: 8, previousAssistantId: 9 })
  })

  it('returns null previous IDs when the assignment had no prior assignee or assistant', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: null,
      assistantId: null,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)
    expect(result).toMatchObject({ previousAssigneeId: null, previousAssistantId: null })
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

  // Duration shortcut: the assign-part sheet lets managers tweak the runtime
  // of a specific part without opening the template editor. The value is
  // always written through — `null` clears the row's duration.
  it('persists durationMin on the internal-speaker update when provided', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1 } as never)

    await assignPart(db, 1, 5, null, null, 'Topic', 1, 12)

    const updateCall = vi.mocked(db.programmePartAssignment.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ durationMin: 12 })
  })

  it('persists durationMin on the external-speaker update when provided', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.externalSpeaker.findFirst).mockResolvedValue({ id: 99, name: 'External Bob' } as never)
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1 } as never)

    await assignPart(db, 1, null, null, 99, 'Topic', 1, 45)

    const updateCall = vi.mocked(db.programmePartAssignment.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ durationMin: 45 })
  })

  it('clears durationMin when null is passed', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1 } as never)

    await assignPart(db, 1, 5, null, null, 'Topic', 1, null)

    const updateCall = vi.mocked(db.programmePartAssignment.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ durationMin: null })
  })

  it('defaults durationMin to null when the caller omits it (clears the row)', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1 } as never)

    await assignPart(db, 1, 5, null, null, 'Topic', 1)

    const updateCall = vi.mocked(db.programmePartAssignment.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ durationMin: null })
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

  it('acquires a row lock on the service-role assignment before reading it', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.programmeServiceRoleAssignment.update).mockResolvedValue({ id: 1 } as never)

    await assignServiceRole(db, 1, 5, 1)

    const lockOrder = vi.mocked(db.$executeRaw).mock.invocationCallOrder[0]
    const findOrder = vi.mocked(db.programmeServiceRoleAssignment.findFirst).mock.invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(findOrder)
  })

  // Mirrors the same change on the part-assignment writer — day-off conflicts
  // no longer block the save; they surface via hasConflict=true and block
  // release downstream.
  it('saves assignment with hasConflict=true when assignee has a day-off conflict', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never)
    vi.mocked(db.programmeServiceRoleAssignment.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignServiceRole(db, 1, 5, 1)

    expect(result).toHaveProperty('assignment')
    const updateCall = vi.mocked(db.programmeServiceRoleAssignment.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: true })
  })

  it('updates assignment with hasConflict=false when no conflict', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.programmeServiceRoleAssignment.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignServiceRole(db, 1, 5, 1)
    expect(result).toHaveProperty('assignment')
    const updateCall = vi.mocked(db.programmeServiceRoleAssignment.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: false })
  })

  // Regression pin — same rule as assignPart: released events must block.
  it('BLOCKS assignServiceRole on a RELEASED event when the assignee has a day-off conflict', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { status: 'released', startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never)

    const result = await assignServiceRole(db, 1, 5, 1)

    expect(result).toEqual({ error: expect.stringMatching(DAY_OFF_MESSAGE_PATTERN) })
    expect(db.programmeServiceRoleAssignment.update).not.toHaveBeenCalled()
  })

  it('still saves with hasConflict=true on a DRAFT event when a day-off conflict exists', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue({
      id: 1,
      event: { status: 'draft', startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never)
    vi.mocked(db.programmeServiceRoleAssignment.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignServiceRole(db, 1, 5, 1)

    expect(result).toHaveProperty('assignment')
    const updateCall = vi.mocked(db.programmeServiceRoleAssignment.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: true })
  })

  it('returns the previous assigneeId on success', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: 8,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.programmeServiceRoleAssignment.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignServiceRole(db, 1, 5, 1)
    expect(result).toMatchObject({ previousAssigneeId: 8 })
  })

  it('returns null previous ID when the service role had no prior assignee', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: null,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.programmeServiceRoleAssignment.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignServiceRole(db, 1, 5, 1)
    expect(result).toMatchObject({ previousAssigneeId: null })
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
  it('resets assignee to null and returns the updated assignment', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: 8,
      assistantId: 9,
    } as never)
    const updated = { id: 1, assigneeId: null, hasConflict: false }
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue(updated as never)

    const result = await unassignPart(db, 1, 1)
    expect(result).toMatchObject({ assignment: updated })
  })

  it('returns the previous assigneeId and assistantId so the route can notify them', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: 8,
      assistantId: 9,
    } as never)
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1 } as never)

    const result = await unassignPart(db, 1, 1)
    expect(result).toMatchObject({ previousAssigneeId: 8, previousAssistantId: 9 })
  })

  it('returns null previous IDs when the assignment was already empty', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: null,
      assistantId: null,
    } as never)
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 1 } as never)

    const result = await unassignPart(db, 1, 1)
    expect(result).toMatchObject({ previousAssigneeId: null, previousAssistantId: null })
  })

  it('returns null when the assignment does not exist', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue(null as never)

    const result = await unassignPart(db, 999, 1)
    expect(result).toBeNull()
    expect(db.programmePartAssignment.update).not.toHaveBeenCalled()
  })
})

describe('unassignServiceRole', () => {
  it('resets assignee to null and returns the updated assignment', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: 8,
    } as never)
    const updated = { id: 1, assigneeId: null, hasConflict: false }
    vi.mocked(db.programmeServiceRoleAssignment.update).mockResolvedValue(updated as never)

    const result = await unassignServiceRole(db, 1, 1)
    expect(result).toMatchObject({ assignment: updated })
  })

  it('returns the previous assigneeId so the route can notify them', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: 8,
    } as never)
    vi.mocked(db.programmeServiceRoleAssignment.update).mockResolvedValue({ id: 1 } as never)

    const result = await unassignServiceRole(db, 1, 1)
    expect(result).toMatchObject({ previousAssigneeId: 8 })
  })

  it('returns null previous ID when the service role was already empty', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: null,
    } as never)
    vi.mocked(db.programmeServiceRoleAssignment.update).mockResolvedValue({ id: 1 } as never)

    const result = await unassignServiceRole(db, 1, 1)
    expect(result).toMatchObject({ previousAssigneeId: null })
  })

  it('returns null when the assignment does not exist', async () => {
    vi.mocked(db.programmeServiceRoleAssignment.findFirst).mockResolvedValue(null as never)

    const result = await unassignServiceRole(db, 999, 1)
    expect(result).toBeNull()
    expect(db.programmeServiceRoleAssignment.update).not.toHaveBeenCalled()
  })
})

describe('refreshConflictFlags', () => {
  // Emulates checkDayOffConflict's underlying event.findFirst by member id.
  // Pass a set of member ids that HAVE an overlapping absence — the mock
  // returns { id: 99 } for those, null otherwise.
  function stubAbsencesFor(memberIds: number[]) {
    const set = new Set(memberIds)
    // biome-ignore lint/suspicious/noExplicitAny: mock signature needs to match Prisma's generated overloads
    vi.mocked(db.event.findFirst).mockImplementation(((args: any) => {
      const target = args?.where?.createdBy?.memberId as number | undefined
      return Promise.resolve(target != null && set.has(target) ? { id: 99 } : null)
    }) as never)
  }

  it('writes hasConflict:true when the member has an overlapping day-off', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    ] as never)
    vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([
      { id: 100, assigneeId: 5, assistantId: null },
    ] as never)
    vi.mocked(db.programmeServiceRoleAssignment.findMany).mockResolvedValue([{ id: 200, assigneeId: 5 }] as never)
    stubAbsencesFor([5])
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 100 } as never)
    vi.mocked(db.programmeServiceRoleAssignment.update).mockResolvedValue({ id: 200 } as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    const partCall = vi.mocked(db.programmePartAssignment.update).mock.calls[0][0]
    const serviceCall = vi.mocked(db.programmeServiceRoleAssignment.update).mock.calls[0][0]
    expect(partCall?.data).toEqual({ hasConflict: true })
    expect(serviceCall?.data).toEqual({ hasConflict: true })
  })

  it('writes hasConflict:false when the member no longer has an overlapping day-off', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    ] as never)
    vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([
      { id: 100, assigneeId: 5, assistantId: null },
    ] as never)
    vi.mocked(db.programmeServiceRoleAssignment.findMany).mockResolvedValue([{ id: 200, assigneeId: 5 }] as never)
    stubAbsencesFor([]) // no absences overlap
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 100 } as never)
    vi.mocked(db.programmeServiceRoleAssignment.update).mockResolvedValue({ id: 200 } as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    const partCall = vi.mocked(db.programmePartAssignment.update).mock.calls[0][0]
    const serviceCall = vi.mocked(db.programmeServiceRoleAssignment.update).mock.calls[0][0]
    expect(partCall?.data).toEqual({ hasConflict: false })
    expect(serviceCall?.data).toEqual({ hasConflict: false })
  })

  // The clobber that #250's shape allowed: two members share a part
  // assignment (speaker + reader). When the refreshed member is fine but the
  // OTHER participant still has an overlapping absence, the row's
  // hasConflict must stay true — a bare `updateMany({ hasConflict: <this
  // member's result> })` would silently clear the flag and let release
  // proceed even though the co-participant is absent.
  it('preserves hasConflict when the co-participant still has an overlapping absence', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    ] as never)
    // Alice(5) = speaker (assigneeId), Bob(6) = reader (assistantId).
    vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([
      { id: 100, assigneeId: 5, assistantId: 6 },
    ] as never)
    vi.mocked(db.programmeServiceRoleAssignment.findMany).mockResolvedValue([] as never)
    // Alice: no absence. Bob: absence present.
    stubAbsencesFor([6])
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 100 } as never)

    // Refresh for Alice (her absence just got cleared).
    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    const partCall = vi.mocked(db.programmePartAssignment.update).mock.calls[0][0]
    expect(partCall?.data).toEqual({ hasConflict: true })
  })

  // Symmetric case: the refreshed member is fine as reader; speaker is fine
  // too. Both slots clear → flag must go false.
  it('writes hasConflict:false only when both participants are clear', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    ] as never)
    vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([
      { id: 100, assigneeId: 5, assistantId: 6 },
    ] as never)
    vi.mocked(db.programmeServiceRoleAssignment.findMany).mockResolvedValue([] as never)
    stubAbsencesFor([]) // nobody has an absence
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 100 } as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    const partCall = vi.mocked(db.programmePartAssignment.update).mock.calls[0][0]
    expect(partCall?.data).toEqual({ hasConflict: false })
  })

  it('does nothing when no overlapping events', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    expect(db.programmePartAssignment.update).not.toHaveBeenCalled()
    expect(db.programmePartAssignment.findMany).not.toHaveBeenCalled()
  })

  // Every overlapping event must be reconciled independently. A regression
  // that early-returned after the first iteration would leave later events
  // stuck on stale flags.
  it('iterates every overlapping event, updating each independently', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
      { id: 2, startDate: new Date(2026, 3, 15), endDate: new Date(2026, 3, 15) },
      { id: 3, startDate: new Date(2026, 3, 16), endDate: new Date(2026, 3, 16) },
    ] as never)
    // biome-ignore lint/suspicious/noExplicitAny: mock signature needs to match Prisma's generated overloads
    vi.mocked(db.programmePartAssignment.findMany).mockImplementation(((args: any) => {
      const eventId = args?.where?.eventId as number
      return Promise.resolve([{ id: eventId * 10, assigneeId: 5, assistantId: null }])
    }) as never)
    vi.mocked(db.programmeServiceRoleAssignment.findMany).mockResolvedValue([] as never)
    stubAbsencesFor([5])
    vi.mocked(db.programmePartAssignment.update).mockResolvedValue({ id: 0 } as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 17), 1)

    expect(vi.mocked(db.programmePartAssignment.findMany).mock.calls).toHaveLength(3)
    expect(vi.mocked(db.programmePartAssignment.update).mock.calls).toHaveLength(3)
  })

  // Regression pin — participants are Members (`assigneeId`, `assistantId`
  // reference Member.id). Filtering with a UserAccount.id would silently miss
  // every assignment whose Member.id differs from the assignee's account.id.
  it('filters part and service assignments by memberId', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    ] as never)
    vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([] as never)
    vi.mocked(db.programmeServiceRoleAssignment.findMany).mockResolvedValue([] as never)

    const memberId = 5000
    await refreshConflictFlags(db, memberId, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    const partCall = vi.mocked(db.programmePartAssignment.findMany).mock.calls[0][0]
    const partWhere = partCall?.where as Record<string, unknown>
    expect(partWhere.OR).toEqual([{ assigneeId: memberId }, { assistantId: memberId }])

    const serviceCall = vi.mocked(db.programmeServiceRoleAssignment.findMany).mock.calls[0][0]
    const serviceWhere = serviceCall?.where as Record<string, unknown>
    expect(serviceWhere.assigneeId).toBe(memberId)
  })

  // Regression pin — untemplated events also carry assignments (added
  // manually) and must participate in the hasConflict invariant. A prior
  // `templateId: { not: null }` filter excluded them.
  it('includes untemplated events (no templateId filter)', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    const call = vi.mocked(db.event.findMany).mock.calls[0][0]
    const where = call?.where as Record<string, unknown>
    expect(where).not.toHaveProperty('templateId')
  })

  // Day-off events themselves are just date ranges — they have no part or
  // service assignments. Iterating over them is wasted work and semantically
  // odd (a day-off isn't a programme event that can conflict with itself).
  //
  // The filter must use `NOT: { template: { key: 'day-off' } }` (not
  // `template: { key: { not: 'day-off' } }`): Prisma's relational filter
  // inner-joins through `template`, so the second form silently drops
  // events whose templateId is null — a shape older legacy rows may still
  // carry until the drop-EventKind migration lands.
  it('excludes day-off events but keeps null-template events in the overlapping-events lookup', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    const call = vi.mocked(db.event.findMany).mock.calls[0][0]
    const where = call?.where as Record<string, unknown>
    expect(where.NOT).toEqual({ template: { key: ProgrammeTemplateKey.DayOff } })
    expect(where).not.toHaveProperty('template')
  })
})
