import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findFirst: vi.fn() },
  },
}))

vi.mock('~/features/notifications/index.server', () => ({
  notify: vi.fn(),
}))

vi.mock('~/features/display-board/index.server', () => ({
  resolveProgrammeLink: vi.fn(),
}))

const { dispatchAssignmentDiffs, notifyAssignment, partAssignmentDiffs, serviceRoleAssignmentDiffs } = await import(
  './notify-assignment.server'
)
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { notify } = await import('~/features/notifications/index.server')
const { resolveProgrammeLink } = await import('~/features/display-board/index.server')

const CTX = {
  event: {
    id: 1,
    name: 'Weekly meeting',
    startDate: new Date('2026-07-20T18:30:00Z'),
    templateId: 9,
    status: 'released' as const,
  },
  assignmentName: 'Perles de la Parole',
  entityType: 'ProgrammePartAssignment' as const,
  entityId: 100,
  congregationId: 42,
  actorId: 7,
  locale: 'en',
  timezone: 'UTC',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(resolveProgrammeLink).mockResolvedValue('/board')
})

describe('notifyAssignment', () => {
  it("resolves the member's linked UserAccount and forwards to notify() with entity-user routing", async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ id: 33 } as never)

    await notifyAssignment(db, CTX, { type: 'programme.assignment.assigned', memberId: 55, role: 'speaker' })

    expect(db.userAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberId: 55,
          congregationId: 42,
          active: true,
          member: { leftAt: null },
        }),
      }),
    )
    expect(notify).toHaveBeenCalledTimes(1)
    const call = vi.mocked(notify).mock.calls[0][1]
    expect(call).toMatchObject({
      type: 'programme.assignment.assigned',
      entityType: 'ProgrammePartAssignment',
      entityId: 100,
      congregationId: 42,
      recipientId: 33,
      actorId: 7,
    })
    expect(call.payload).toMatchObject({
      eventId: 1,
      eventName: 'Weekly meeting',
      assignmentName: 'Perles de la Parole',
      role: 'speaker',
    })
    expect(typeof call.payload?.eventDate).toBe('string')
    expect((call.payload?.eventDate as string).length).toBeGreaterThan(0)
  })

  it('includes the resolved programme link in the payload', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ id: 33 } as never)
    vi.mocked(resolveProgrammeLink).mockResolvedValue('/board/dynamic/7/viewer?eventId=1')

    await notifyAssignment(db, CTX, { type: 'programme.assignment.assigned', memberId: 55, role: 'speaker' })

    expect(resolveProgrammeLink).toHaveBeenCalledWith(db, { id: 1, templateId: 9 }, 42)
    const call = vi.mocked(notify).mock.calls[0][1]
    expect(call.payload).toMatchObject({ link: '/board/dynamic/7/viewer?eventId=1' })
  })

  it('falls back to /board in the payload when no dynamic document covers the template', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ id: 33 } as never)
    vi.mocked(resolveProgrammeLink).mockResolvedValue('/board')

    await notifyAssignment(db, CTX, { type: 'programme.assignment.assigned', memberId: 55, role: 'speaker' })

    const call = vi.mocked(notify).mock.calls[0][1]
    expect(call.payload).toMatchObject({ link: '/board' })
  })

  it('does not enqueue anything when the member has no linked UserAccount', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(null as never)

    await notifyAssignment(db, CTX, { type: 'programme.assignment.assigned', memberId: 55, role: 'speaker' })

    expect(notify).not.toHaveBeenCalled()
  })

  // Members who left the congregation must not receive assignment emails —
  // even if their UserAccount is still `active: true`. The `member.leftAt`
  // filter lives in the WHERE, so if a member has left, findFirst returns
  // null and we short-circuit through the no-linked-account branch.
  it('filters out members who have left the congregation (member.leftAt is null)', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue(null as never)

    await notifyAssignment(db, CTX, { type: 'programme.assignment.assigned', memberId: 55, role: 'speaker' })

    // The query must include the leftAt=null filter — otherwise a still-
    // active UserAccount tied to a left Member would receive the email.
    expect(db.userAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ member: { leftAt: null } }),
      }),
    )
    expect(notify).not.toHaveBeenCalled()
  })

  it('forwards the unassigned type unchanged', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ id: 33 } as never)

    await notifyAssignment(db, CTX, { type: 'programme.assignment.unassigned', memberId: 55, role: 'reader' })

    expect(notify).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: 'programme.assignment.unassigned', recipientId: 33 }),
    )
  })
})

describe('dispatchAssignmentDiffs', () => {
  it('fires nothing when the diff is a no-op (same person before and after)', async () => {
    await dispatchAssignmentDiffs(db, CTX, [{ role: 'speaker', previousMemberId: 5, newMemberId: 5 }])
    expect(notify).not.toHaveBeenCalled()
  })

  it('fires assigned when a slot gains a member', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ id: 33 } as never)
    await dispatchAssignmentDiffs(db, CTX, [{ role: 'speaker', previousMemberId: null, newMemberId: 5 }])
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(db, expect.objectContaining({ type: 'programme.assignment.assigned' }))
  })

  it('fires unassigned when a slot loses a member', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ id: 33 } as never)
    await dispatchAssignmentDiffs(db, CTX, [{ role: 'reader', previousMemberId: 5, newMemberId: null }])
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(db, expect.objectContaining({ type: 'programme.assignment.unassigned' }))
  })

  it('fires unassigned for the old and assigned for the new when a slot swaps', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ id: 33 } as never)
    await dispatchAssignmentDiffs(db, CTX, [{ role: 'speaker', previousMemberId: 5, newMemberId: 8 }])
    expect(notify).toHaveBeenCalledTimes(2)
    const kinds = vi
      .mocked(notify)
      .mock.calls.map(c => c[1].type)
      .sort()
    expect(kinds).toEqual(['programme.assignment.assigned', 'programme.assignment.unassigned'])
  })

  it('processes multiple slots independently', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ id: 33 } as never)
    await dispatchAssignmentDiffs(db, CTX, [
      { role: 'speaker', previousMemberId: null, newMemberId: 5 },
      { role: 'reader', previousMemberId: 8, newMemberId: null },
    ])
    expect(notify).toHaveBeenCalledTimes(2)
  })

  // Only released events fire notifications. Anything else — 'draft' today,
  // whatever future status the schema grows tomorrow — must be silent, so a
  // typo or an unhandled state cannot silently spam publishers.
  it('does not fire notifications when the event is still a draft', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ id: 33 } as never)
    const draftCtx = { ...CTX, event: { ...CTX.event, status: 'draft' as const } }
    await dispatchAssignmentDiffs(db, draftCtx, [
      { role: 'speaker', previousMemberId: null, newMemberId: 5 },
      { role: 'reader', previousMemberId: 8, newMemberId: null },
    ])
    expect(notify).not.toHaveBeenCalled()
  })

  // Whitelist guard: any status that is not 'released' must be silent. If we
  // ever grow a third status without updating this gate, a blacklist would
  // silently notify.
  it('does not fire notifications for an unknown / future event status', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ id: 33 } as never)
    // A hypothetical future status. TypeScript will complain on the cast, but
    // the runtime code must still refuse to notify.
    const unknownCtx = { ...CTX, event: { ...CTX.event, status: 'archived' as unknown as 'released' } }
    await dispatchAssignmentDiffs(db, unknownCtx, [{ role: 'speaker', previousMemberId: null, newMemberId: 5 }])
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('partAssignmentDiffs (pure)', () => {
  it('maps previousAssigneeId → speaker slot and previousAssistantId → reader slot', () => {
    const diffs = partAssignmentDiffs(
      { previousAssigneeId: 5, previousAssistantId: 8 },
      { assigneeId: 9, assistantId: 10 },
    )
    expect(diffs).toEqual([
      { role: 'speaker', previousMemberId: 5, newMemberId: 9 },
      { role: 'reader', previousMemberId: 8, newMemberId: 10 },
    ])
  })

  it('threads null through both directions (empty slot before or after)', () => {
    const diffs = partAssignmentDiffs(
      { previousAssigneeId: null, previousAssistantId: 8 },
      { assigneeId: 5, assistantId: null },
    )
    expect(diffs).toEqual([
      { role: 'speaker', previousMemberId: null, newMemberId: 5 },
      { role: 'reader', previousMemberId: 8, newMemberId: null },
    ])
  })

  it('always returns two diffs (speaker + reader) in that exact order', () => {
    const diffs = partAssignmentDiffs(
      { previousAssigneeId: null, previousAssistantId: null },
      { assigneeId: null, assistantId: null },
    )
    expect(diffs).toHaveLength(2)
    expect(diffs.map(d => d.role)).toEqual(['speaker', 'reader'])
  })
})

describe('serviceRoleAssignmentDiffs (pure)', () => {
  it('maps previousAssigneeId → servant slot', () => {
    const diffs = serviceRoleAssignmentDiffs({ previousAssigneeId: 5 }, { assigneeId: 9 })
    expect(diffs).toEqual([{ role: 'servant', previousMemberId: 5, newMemberId: 9 }])
  })

  it('produces exactly one diff', () => {
    const diffs = serviceRoleAssignmentDiffs({ previousAssigneeId: null }, { assigneeId: null })
    expect(diffs).toHaveLength(1)
    expect(diffs[0].role).toBe('servant')
  })
})
