import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    userAccount: { findFirst: vi.fn() },
    item: { findMany: vi.fn(), findFirst: vi.fn() },
    notificationEvent: { updateMany: vi.fn() },
  },
}))

vi.mock('~/features/notifications/index.server', () => ({
  notify: vi.fn(),
}))

vi.mock('~/features/display-board/index.server', () => ({
  resolveProgrammeLink: vi.fn(),
}))

const {
  cancelPendingAssignmentNotices,
  dispatchAssignmentDiffs,
  notifyAssignment,
  partAssignmentDiffs,
  servicePartAssignmentDiffs,
} = await import('./notify-assignment.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { notify } = await import('~/features/notifications/index.server')
const { resolveProgrammeLink } = await import('~/features/display-board/index.server')

const CTX = {
  event: {
    id: 1,
    name: 'Weekly meeting',
    startDate: new Date('2026-07-20T18:30:00Z'),
    templateId: 9,
  },
  assignmentName: 'Perles de la Parole',
  entityType: 'Item' as const,
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
          // notificationRecipientFilter's OR — locked here so a regression
          // that drops the recipient-eligibility gate is caught by the
          // primary happy-path test.
          OR: [{ memberId: null }, { member: { leftAt: null, anonymizedAt: null } }],
        }),
      }),
    )
    expect(notify).toHaveBeenCalledTimes(1)
    const call = vi.mocked(notify).mock.calls[0][1]
    expect(call).toMatchObject({
      type: 'programme.assignment.assigned',
      entityType: 'Item',
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
    const payload = call.payload as { eventDate?: string }
    expect(typeof payload.eventDate).toBe('string')
    expect((payload.eventDate as string).length).toBeGreaterThan(0)
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
  // The item's own schedule decides (plan §10, 5b): published by default here.
  const scheduleOfItem = (status: string | null) =>
    vi
      .mocked(db.item.findFirst)
      .mockResolvedValue((status == null ? { schedule: null } : { schedule: { status } }) as never)
  beforeEach(() => scheduleOfItem('published'))

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

  // Only a published schedule fires notifications. Anything else — 'draft' today, whatever status the schema grows
  // tomorrow, an item without a schedule or gone — must be silent, so a typo or an unhandled state cannot spam
  // publishers.
  it.each([
    ['still a draft', 'draft'],
    ['of an unknown status', 'archived'],
  ])('does not fire notifications when the item’s schedule is %s', async (_name, status) => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ id: 33 } as never)
    scheduleOfItem(status)
    await dispatchAssignmentDiffs(db, CTX, [
      { role: 'speaker', previousMemberId: null, newMemberId: 5 },
      { role: 'reader', previousMemberId: 8, newMemberId: null },
    ])
    expect(notify).not.toHaveBeenCalled()
  })

  it.each([
    ['without a schedule', () => scheduleOfItem(null)],
    ['gone', () => vi.mocked(db.item.findFirst).mockResolvedValue(null)],
  ])('does not fire notifications for an item %s', async (_name, arrange) => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ id: 33 } as never)
    arrange()
    await dispatchAssignmentDiffs(db, CTX, [{ role: 'speaker', previousMemberId: null, newMemberId: 5 }])
    expect(notify).not.toHaveBeenCalled()
  })

  it('reads the status of the item it notifies about, in its congregation', async () => {
    vi.mocked(db.userAccount.findFirst).mockResolvedValue({ id: 33 } as never)
    await dispatchAssignmentDiffs(db, CTX, [{ role: 'speaker', previousMemberId: null, newMemberId: 5 }])
    expect(db.item.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CTX.entityId, congregationId: CTX.congregationId } }),
    )
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

describe('servicePartAssignmentDiffs (pure)', () => {
  it('maps previousAssigneeId → servant slot', () => {
    const diffs = servicePartAssignmentDiffs({ previousAssigneeId: 5 }, { assigneeId: 9 })
    expect(diffs).toEqual([{ role: 'servant', previousMemberId: 5, newMemberId: 9 }])
  })

  it('produces exactly one diff', () => {
    const diffs = servicePartAssignmentDiffs({ previousAssigneeId: null }, { assigneeId: null })
    expect(diffs).toHaveLength(1)
    expect(diffs[0].role).toBe('servant')
  })
})

describe('cancelPendingAssignmentNotices', () => {
  it('runs no query and cancels nothing for an empty list of items', async () => {
    expect(await cancelPendingAssignmentNotices(db as never, 42, [])).toBe(0)

    expect(db.item.findMany).not.toHaveBeenCalled()
    expect(db.notificationEvent.updateMany).not.toHaveBeenCalled()
  })

  // Item 1001 mirrors the old part row 100: a notice the previous image wrote names the old row, so both are cancelled.
  it('cancels the notice naming an item and the notice naming the old row it mirrors', async () => {
    vi.mocked(db.item.findMany).mockResolvedValue([{ legacyPartId: 100, legacyServiceId: null }] as never)
    vi.mocked(db.notificationEvent.updateMany).mockResolvedValue({ count: 2 } as never)

    const cancelled = await cancelPendingAssignmentNotices(db as never, 42, [1001])

    expect(cancelled).toBe(2)
    expect(db.notificationEvent.updateMany).toHaveBeenCalledWith({
      where: {
        congregationId: 42,
        status: 'pending',
        OR: [
          { entityType: 'Item', entityId: { in: [1001] } },
          { entityType: 'EventPart', entityId: { in: [100] } },
        ],
      },
      data: { status: 'cancelled', processedAt: expect.any(Date) },
    })
  })
})
