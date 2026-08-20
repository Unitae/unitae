import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventTemplateKey } from '~/features/events/model/event-template.type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findFirst: vi.fn(), findMany: vi.fn() },
    eventPart: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    eventServicePart: {
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
  getServicePartAssignmentAllowedRoleIds: vi.fn().mockResolvedValue([]),
  resolveEligibleUserIds: vi.fn().mockResolvedValue([5]),
}))

const { assignPart, assignServicePart, unassignPart, unassignServicePart, checkDayOffConflict } = await import(
  './event-part-assignments.server'
)
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const allowedRoles = await import('~/features/events/server/allowed-roles.server')

// Matches the shared "absence" copy in DAY_OFF_MESSAGE without pinning the
// exact French string, so a wording tweak in the policy file doesn't force a
// test churn (the policy test already pins the exact strings).
const DAY_OFF_MESSAGE_PATTERN = /absence/i

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(allowedRoles.getPartAssignmentAllowedRoleIds).mockResolvedValue([])
  vi.mocked(allowedRoles.getServicePartAssignmentAllowedRoleIds).mockResolvedValue([])
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
    vi.mocked(db.eventPart.findFirst).mockResolvedValue(null as never)
    const result = await assignPart(db, 999, 5, null, null, 'Topic', 1)
    expect(result).toHaveProperty('error')
  })

  it('acquires a row lock on the assignment before reading it', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1 } as never)

    await assignPart(db, 1, 5, null, null, 'Topic', 1)

    // $executeRaw MUST fire before findFirst — the lock is the whole point.
    // Assert order via mock.invocationCallOrder.
    const lockOrder = vi.mocked(db.$executeRaw).mock.invocationCallOrder[0]
    const findOrder = vi.mocked(db.eventPart.findFirst).mock.invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(findOrder)
  })

  // Day-off conflicts no longer block the save — the manager needs to be able
  // to draft a schedule freely. The conflict surfaces as hasConflict=true on
  // the assignment and blocks the event's release step downstream.
  it('saves assignment with hasConflict=true when assignee has a day-off conflict', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never) // day-off found
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)

    expect(result).toHaveProperty('assignment')
    const updateCall = vi.mocked(db.eventPart.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: true })
  })

  // Symmetric — assistant absent, speaker fine → still saves with hasConflict=true.
  it('saves assignment with hasConflict=true when assistant has a day-off conflict', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
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
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1 } as never)

    await assignPart(db, 1, 5, 7, null, 'Topic', 1)

    const updateCall = vi.mocked(db.eventPart.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: true })
  })

  it('updates assignment with hasConflict=false when no conflict', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never) // no day-off
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)
    expect(result).toHaveProperty('assignment')
    const updateCall = vi.mocked(db.eventPart.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: false })
  })

  // Regression pin: draft events accept conflicting assignments (the schedule
  // is still being built); released events must NOT — a manager scheduling
  // over a known absence on a public event is silent scheduling breakage.
  it('BLOCKS assignPart on a RELEASED event when the speaker has a day-off conflict', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      event: { status: 'released', startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never) // day-off found

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)

    expect(result).toEqual({ error: expect.stringMatching(DAY_OFF_MESSAGE_PATTERN) })
    expect(db.eventPart.update).not.toHaveBeenCalled()
  })

  it('BLOCKS assignPart on a RELEASED event when the reader has a day-off conflict', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
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
    expect(db.eventPart.update).not.toHaveBeenCalled()
  })

  it('still saves with hasConflict=true on a DRAFT event when a day-off conflict exists', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      event: { status: 'draft', startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never)
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)

    expect(result).toHaveProperty('assignment')
    const updateCall = vi.mocked(db.eventPart.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: true })
  })

  // Consumers (route + notification path) need to diff the old assignee vs
  // the new one to decide who to notify. Returning the previous IDs alongside
  // the new assignment keeps the diff logic out of the route.
  it('returns the previous assigneeId and assistantId on success', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: 8,
      assistantId: 9,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)
    expect(result).toMatchObject({ previousAssigneeId: 8, previousAssistantId: 9 })
  })

  it('returns null previous IDs when the assignment had no prior assignee or assistant', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: null,
      assistantId: null,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)
    expect(result).toMatchObject({ previousAssigneeId: null, previousAssistantId: null })
  })

  it('allows null assigneeId', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1, assigneeId: null } as never)

    const result = await assignPart(db, 1, null, null, null, '', 1)
    expect(result).toHaveProperty('assignment')
  })

  it('rejects when speaker is not in the eligible role set', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(allowedRoles.getPartAssignmentAllowedRoleIds).mockResolvedValueOnce([99])
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValueOnce([42]) // not user 5

    const result = await assignPart(db, 1, 5, null, null, 'Topic', 1)
    expect(result).toHaveProperty('error')
    expect(db.eventPart.update).not.toHaveBeenCalled()
  })

  it('rejects when reader is not in the eligible role set', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
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
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.externalSpeaker.findFirst).mockResolvedValue({
      id: 99,
      name: 'External Bob',
    } as never)
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1, externalSpeakerId: 99 } as never)

    const result = await assignPart(db, 1, null, null, 99, 'Topic', 1)

    expect(result).toHaveProperty('assignment')
    expect(allowedRoles.resolveEligibleUserIds).not.toHaveBeenCalled()
  })

  // Duration shortcut: the assign-part sheet lets managers tweak the runtime
  // of a specific part without opening the template editor. The value is
  // always written through — `null` clears the row's duration.
  it('persists durationMin on the internal-speaker update when provided', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1 } as never)

    await assignPart(db, 1, 5, null, null, 'Topic', 1, 12)

    const updateCall = vi.mocked(db.eventPart.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ durationMin: 12 })
  })

  it('persists durationMin on the external-speaker update when provided', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.externalSpeaker.findFirst).mockResolvedValue({ id: 99, name: 'External Bob' } as never)
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1 } as never)

    await assignPart(db, 1, null, null, 99, 'Topic', 1, 45)

    const updateCall = vi.mocked(db.eventPart.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ durationMin: 45 })
  })

  it('clears durationMin when null is passed', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1 } as never)

    await assignPart(db, 1, 5, null, null, 'Topic', 1, null)

    const updateCall = vi.mocked(db.eventPart.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ durationMin: null })
  })

  it('defaults durationMin to null when the caller omits it (clears the row)', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1 } as never)

    await assignPart(db, 1, 5, null, null, 'Topic', 1)

    const updateCall = vi.mocked(db.eventPart.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ durationMin: null })
  })

  // Wave 1 bug 4 — regression test.
  // The same person used to be assignable as both speaker (assigneeId) and
  // reader (assistantId) of the same programme part, because each was
  // validated independently for role eligibility and day-off conflict but
  // never compared to the other.
  it('rejects when the same person is assigned as both speaker and reader', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValue([5])

    const result = await assignPart(db, 1, 5, 5, null, 'Topic', 1)

    expect(result).toHaveProperty('error')
    expect(db.eventPart.update).not.toHaveBeenCalled()
  })
})

describe('assignServicePart', () => {
  it('returns error when assignment not found', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue(null as never)
    const result = await assignServicePart(db, 999, 5, 1)
    expect(result).toHaveProperty('error')
  })

  it('acquires a row lock on the service-role assignment before reading it', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.eventServicePart.update).mockResolvedValue({ id: 1 } as never)

    await assignServicePart(db, 1, 5, 1)

    const lockOrder = vi.mocked(db.$executeRaw).mock.invocationCallOrder[0]
    const findOrder = vi.mocked(db.eventServicePart.findFirst).mock.invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(findOrder)
  })

  // Mirrors the same change on the part-assignment writer — day-off conflicts
  // no longer block the save; they surface via hasConflict=true and block
  // release downstream.
  it('saves assignment with hasConflict=true when assignee has a day-off conflict', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never)
    vi.mocked(db.eventServicePart.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignServicePart(db, 1, 5, 1)

    expect(result).toHaveProperty('assignment')
    const updateCall = vi.mocked(db.eventServicePart.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: true })
  })

  it('updates assignment with hasConflict=false when no conflict', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.eventServicePart.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignServicePart(db, 1, 5, 1)
    expect(result).toHaveProperty('assignment')
    const updateCall = vi.mocked(db.eventServicePart.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: false })
  })

  // Regression pin — same rule as assignPart: released events must block.
  it('BLOCKS assignServicePart on a RELEASED event when the assignee has a day-off conflict', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      id: 1,
      event: { status: 'released', startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never)

    const result = await assignServicePart(db, 1, 5, 1)

    expect(result).toEqual({ error: expect.stringMatching(DAY_OFF_MESSAGE_PATTERN) })
    expect(db.eventServicePart.update).not.toHaveBeenCalled()
  })

  it('still saves with hasConflict=true on a DRAFT event when a day-off conflict exists', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      id: 1,
      event: { status: 'draft', startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never)
    vi.mocked(db.eventServicePart.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignServicePart(db, 1, 5, 1)

    expect(result).toHaveProperty('assignment')
    const updateCall = vi.mocked(db.eventServicePart.update).mock.calls[0][0]
    expect(updateCall?.data).toMatchObject({ hasConflict: true })
  })

  it('returns the previous assigneeId on success', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: 8,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.eventServicePart.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignServicePart(db, 1, 5, 1)
    expect(result).toMatchObject({ previousAssigneeId: 8 })
  })

  it('returns null previous ID when the service role had no prior assignee', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: null,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.eventServicePart.update).mockResolvedValue({ id: 1, assigneeId: 5 } as never)

    const result = await assignServicePart(db, 1, 5, 1)
    expect(result).toMatchObject({ previousAssigneeId: null })
  })

  it('rejects when assignee is not in the eligible role set', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      id: 1,
      event: { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    } as never)
    vi.mocked(allowedRoles.getServicePartAssignmentAllowedRoleIds).mockResolvedValueOnce([99])
    vi.mocked(allowedRoles.resolveEligibleUserIds).mockResolvedValueOnce([42])

    const result = await assignServicePart(db, 1, 5, 1)
    expect(result).toHaveProperty('error')
    expect(db.eventServicePart.update).not.toHaveBeenCalled()
  })
})

describe('unassignPart', () => {
  it('resets assignee to null and returns the updated assignment', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: 8,
      assistantId: 9,
    } as never)
    const updated = { id: 1, assigneeId: null, hasConflict: false }
    vi.mocked(db.eventPart.update).mockResolvedValue(updated as never)

    const result = await unassignPart(db, 1, 1)
    expect(result).toMatchObject({ assignment: updated })
  })

  it('returns the previous assigneeId and assistantId so the route can notify them', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: 8,
      assistantId: 9,
    } as never)
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1 } as never)

    const result = await unassignPart(db, 1, 1)
    expect(result).toMatchObject({ previousAssigneeId: 8, previousAssistantId: 9 })
  })

  it('returns null previous IDs when the assignment was already empty', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: null,
      assistantId: null,
    } as never)
    vi.mocked(db.eventPart.update).mockResolvedValue({ id: 1 } as never)

    const result = await unassignPart(db, 1, 1)
    expect(result).toMatchObject({ previousAssigneeId: null, previousAssistantId: null })
  })

  it('returns null when the assignment does not exist', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue(null as never)

    const result = await unassignPart(db, 999, 1)
    expect(result).toBeNull()
    expect(db.eventPart.update).not.toHaveBeenCalled()
  })
})

describe('unassignServicePart', () => {
  it('resets assignee to null and returns the updated assignment', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: 8,
    } as never)
    const updated = { id: 1, assigneeId: null, hasConflict: false }
    vi.mocked(db.eventServicePart.update).mockResolvedValue(updated as never)

    const result = await unassignServicePart(db, 1, 1)
    expect(result).toMatchObject({ assignment: updated })
  })

  it('returns the previous assigneeId so the route can notify them', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: 8,
    } as never)
    vi.mocked(db.eventServicePart.update).mockResolvedValue({ id: 1 } as never)

    const result = await unassignServicePart(db, 1, 1)
    expect(result).toMatchObject({ previousAssigneeId: 8 })
  })

  it('returns null previous ID when the service role was already empty', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      id: 1,
      assigneeId: null,
    } as never)
    vi.mocked(db.eventServicePart.update).mockResolvedValue({ id: 1 } as never)

    const result = await unassignServicePart(db, 1, 1)
    expect(result).toMatchObject({ previousAssigneeId: null })
  })

  it('returns null when the assignment does not exist', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue(null as never)

    const result = await unassignServicePart(db, 999, 1)
    expect(result).toBeNull()
    expect(db.eventServicePart.update).not.toHaveBeenCalled()
  })
})
