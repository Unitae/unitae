import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditAction } from '~/shared/domain/audit.server'
import { EVENT_STATUS_ERRORS } from './event-status.policy'

vi.mock('~/shared/infra/db.server', () => {
  const unscopedDb = {
    event: { findFirst: vi.fn(), update: vi.fn() },
    programmePartAssignment: { findMany: vi.fn() },
    programmeServiceRoleAssignment: { findMany: vi.fn() },
    notificationEvent: { updateMany: vi.fn() },
    userAccount: { findFirst: vi.fn() },
  }
  return {
    unscopedDb,
    // Per-event bulk paths use withScope; the mock just invokes the callback
    // with the shared mock client. Tests can override per-event behaviour by
    // programming the underlying mock via event.findFirst.mockImplementation.
    withScope: vi.fn(async (_congregationId: number, fn: (tx: unknown) => unknown) => fn(unscopedDb)),
  }
})

vi.mock('~/shared/domain/audit.server', async importOriginal => {
  const actual = await importOriginal<typeof import('~/shared/domain/audit.server')>()
  return { ...actual, audit: vi.fn(), auditInTransaction: vi.fn() }
})

vi.mock('./notify-assignment.server', async importOriginal => {
  const actual = await importOriginal<typeof import('./notify-assignment.server')>()
  return { ...actual, notifyAssignment: vi.fn() }
})

const { releaseEvent, unreleaseEvent, fireReleaseNotifications } = await import('./event-status.server')
const { bulkReleaseEvents, bulkUnreleaseEvents } = await import('./event-status-bulk.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { audit, auditInTransaction } = await import('~/shared/domain/audit.server')
const { notifyAssignment } = await import('./notify-assignment.server')

const nctx = { locale: 'fr-FR', timezone: 'Europe/Paris' }
const draftEvent = {
  id: 42,
  name: 'Réunion du milieu de semaine',
  status: 'draft',
  startDate: new Date(2026, 3, 14),
  templateId: 7,
  partAssignments: [] as unknown[],
  serviceRoleAssignments: [] as unknown[],
}
const releasedEvent = { ...draftEvent, status: 'released' }

beforeEach(() => {
  vi.resetAllMocks()
})

// releaseEvent is the tx-only half of the release flow: state flip + audit,
// then return the notify targets so the caller can fire notifications OUTSIDE
// the transaction. Firing notifications inside the tx risked poisoning it
// (a Prisma error in a notify.create marks the tx as aborted; every
// subsequent statement fails and the final COMMIT gets converted to
// ROLLBACK by Postgres — silent ghost releases).
describe('releaseEvent (tx-only)', () => {
  it('returns null when the event does not exist', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    const result = await releaseEvent(db, 999, 1, 5)
    expect(result).toBeNull()
  })

  it('is a no-op when the event is already released; returns the event with empty notifyTargets', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(releasedEvent as never)
    const result = await releaseEvent(db, 42, 1, 5)
    expect(result).toEqual({ event: releasedEvent, notifyTargets: [] })
    expect(db.event.update).not.toHaveBeenCalled()
  })

  it('returns an error and does not update when any assignment has a conflict', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...draftEvent,
      partAssignments: [{ id: 100, name: 'Perle', hasConflict: true, assigneeId: 5, assistantId: null }],
      serviceRoleAssignments: [],
    } as never)

    const result = await releaseEvent(db, 42, 1, 5)

    expect(result).toEqual({ error: expect.stringContaining(EVENT_STATUS_ERRORS.releaseBlockedByConflicts) })
    expect(db.event.update).not.toHaveBeenCalled()
  })

  it('flips status to released and returns the updated event + notifyTargets when nothing conflicts', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(draftEvent as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    const result = await releaseEvent(db, 42, 1, 5)

    expect(result).toEqual({ event: releasedEvent, notifyTargets: [] })
    expect(db.event.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'released' } }))
  })

  it('audits with action EventReleased on success', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(draftEvent as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    await releaseEvent(db, 42, 1, 5)

    // auditInTransaction (writes on the tx client) so the audit rolls back
    // with the release if the tx aborts later. audit() writes on unscopedDb,
    // escaping the tx and leaving phantom rows on rollback.
    expect(auditInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        action: AuditAction.EventReleased,
        congregationId: 1,
        actorId: 5,
        entityType: 'Event',
        entityId: 42,
      }),
    )
    expect(audit).not.toHaveBeenCalled()
  })

  // Notifications are the caller's responsibility now — releaseEvent MUST NOT
  // call notifyAssignment. If it did, a Prisma error inside the notify path
  // would poison the release tx.
  it('never calls notifyAssignment (notifications happen outside the tx)', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...draftEvent,
      partAssignments: [{ id: 100, name: 'Perle', hasConflict: false, assigneeId: 5, assistantId: 6 }],
      serviceRoleAssignments: [{ id: 200, name: 'Accueil', hasConflict: false, assigneeId: 9 }],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    await releaseEvent(db, 42, 1, 5)

    expect(notifyAssignment).not.toHaveBeenCalled()
  })

  it('computes notifyTargets for every populated speaker/reader/servant slot', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...draftEvent,
      partAssignments: [{ id: 100, name: 'Perle', hasConflict: false, assigneeId: 5, assistantId: 6 }],
      serviceRoleAssignments: [{ id: 200, name: 'Accueil', hasConflict: false, assigneeId: 9 }],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    const result = await releaseEvent(db, 42, 1, 5)

    expect(result).toMatchObject({
      notifyTargets: [
        { entityType: 'ProgrammePartAssignment', entityId: 100, assignmentName: 'Perle', memberId: 5, role: 'speaker' },
        { entityType: 'ProgrammePartAssignment', entityId: 100, assignmentName: 'Perle', memberId: 6, role: 'reader' },
        {
          entityType: 'ProgrammeServiceRoleAssignment',
          entityId: 200,
          assignmentName: 'Accueil',
          memberId: 9,
          role: 'servant',
        },
      ],
    })
  })

  it('excludes empty slots from notifyTargets', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...draftEvent,
      partAssignments: [{ id: 100, name: 'Perle', hasConflict: false, assigneeId: null, assistantId: null }],
      serviceRoleAssignments: [{ id: 200, name: 'Accueil', hasConflict: false, assigneeId: null }],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    const result = await releaseEvent(db, 42, 1, 5)

    expect(result).toMatchObject({ notifyTargets: [] })
  })
})

// fireReleaseNotifications is called AFTER releaseEvent's tx commits. It
// opens a fresh withScope per notify, so a single failure only affects that
// notify — not the release, not other notifications.
describe('fireReleaseNotifications', () => {
  const eventShape = { id: 42, name: 'Réunion', startDate: new Date(2026, 3, 14), templateId: 7 }
  const speakerTarget = {
    entityType: 'ProgrammePartAssignment' as const,
    entityId: 100,
    assignmentName: 'Perle',
    memberId: 5,
    role: 'speaker' as const,
  }
  const readerTarget = { ...speakerTarget, memberId: 6, role: 'reader' as const }

  it('does nothing when the targets array is empty', async () => {
    await fireReleaseNotifications(eventShape, [], 1, 5, nctx)
    expect(notifyAssignment).not.toHaveBeenCalled()
  })

  it('calls notifyAssignment once per target with the assigned type', async () => {
    await fireReleaseNotifications(eventShape, [speakerTarget, readerTarget], 1, 5, nctx)

    expect(notifyAssignment).toHaveBeenCalledTimes(2)
    const first = vi.mocked(notifyAssignment).mock.calls[0]
    const second = vi.mocked(notifyAssignment).mock.calls[1]
    expect(first[2]).toMatchObject({ memberId: 5, role: 'speaker', type: 'programme.assignment.assigned' })
    expect(second[2]).toMatchObject({ memberId: 6, role: 'reader', type: 'programme.assignment.assigned' })
  })

  // Guards against a regression where fireReleaseNotifications forgets to
  // stamp status='released' into the notify context. Without that stamp,
  // dispatchAssignmentDiffs (whitelist) would self-suppress the whole burst.
  it('threads status=released into the notification context', async () => {
    await fireReleaseNotifications(eventShape, [speakerTarget], 1, 5, nctx)

    const ctx = vi.mocked(notifyAssignment).mock.calls[0][1]
    expect(ctx.event.status).toBe('released')
  })

  // Pin for the entityType / entityId / assignmentName threading from
  // notifyTargets → notify ctx. A regression that dropped the spread override
  // would send notifications with entityId:0 (base value), colliding on the
  // debounce key and losing all but one recipient.
  it('threads entityType / entityId / assignmentName into each per-target context', async () => {
    await fireReleaseNotifications(
      eventShape,
      [
        speakerTarget,
        {
          entityType: 'ProgrammeServiceRoleAssignment',
          entityId: 200,
          assignmentName: 'Accueil',
          memberId: 9,
          role: 'servant',
        },
      ],
      1,
      5,
      nctx,
    )

    const partCtx = vi.mocked(notifyAssignment).mock.calls[0][1]
    const svcCtx = vi.mocked(notifyAssignment).mock.calls[1][1]
    expect(partCtx).toMatchObject({
      entityType: 'ProgrammePartAssignment',
      entityId: 100,
      assignmentName: 'Perle',
    })
    expect(svcCtx).toMatchObject({
      entityType: 'ProgrammeServiceRoleAssignment',
      entityId: 200,
      assignmentName: 'Accueil',
    })
  })

  // Every target gets its own fresh withScope — one failure never poisons a
  // tx that another notify shares.
  it('opens a fresh withScope per target', async () => {
    const { withScope } = await import('~/shared/infra/db.server')
    await fireReleaseNotifications(eventShape, [speakerTarget, readerTarget], 1, 5, nctx)

    expect(withScope).toHaveBeenCalledTimes(2)
    for (const call of vi.mocked(withScope).mock.calls) {
      expect(call[0]).toBe(1)
    }
  })

  it('swallows and logs errors from a single target without aborting the others', async () => {
    vi.mocked(notifyAssignment)
      .mockRejectedValueOnce(new Error('queue down'))
      .mockResolvedValue(undefined as never)

    await expect(fireReleaseNotifications(eventShape, [speakerTarget, readerTarget], 1, 5, nctx)).resolves.not.toThrow()

    expect(notifyAssignment).toHaveBeenCalledTimes(2)
  })
})

describe('unreleaseEvent', () => {
  it('returns null when the event does not exist', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    const result = await unreleaseEvent(db, 999, 1, 5)
    expect(result).toBeNull()
  })

  it('is a no-op when the event is already draft', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(draftEvent as never)
    const result = await unreleaseEvent(db, 42, 1, 5)
    expect(result).toEqual({ event: draftEvent })
    expect(db.event.update).not.toHaveBeenCalled()
    expect(db.notificationEvent.updateMany).not.toHaveBeenCalled()
  })

  // Prisma's `in: []` matches nothing today, but relying on that contract is
  // brittle — one refactor away from silently cancelling every pending
  // notification in the congregation. Skip the updateMany entirely when the
  // event has no assignments.
  it('skips the notificationEvent updateMany when the event has zero assignments', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...releasedEvent,
      partAssignments: [],
      serviceRoleAssignments: [],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(draftEvent as never)

    await unreleaseEvent(db, 42, 1, 5)

    expect(db.notificationEvent.updateMany).not.toHaveBeenCalled()
  })

  it('flips status back to draft and returns the updated event', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...releasedEvent,
      partAssignments: [],
      serviceRoleAssignments: [],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(draftEvent as never)
    vi.mocked(db.notificationEvent.updateMany).mockResolvedValue({ count: 0 } as never)

    const result = await unreleaseEvent(db, 42, 1, 5)

    expect(result).toEqual({ event: draftEvent })
    expect(db.event.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'draft' } }))
  })

  // Any assignment mail still queued for the 30-min safety window is cancelled
  // when the manager reverts to draft — the schedule is not public anymore, no
  // reason to send it. Mails that have already been sent are not recalled.
  it('cancels pending NotificationEvent rows for the event’s assignments', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...releasedEvent,
      partAssignments: [{ id: 100 }, { id: 101 }],
      serviceRoleAssignments: [{ id: 200 }],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(draftEvent as never)
    vi.mocked(db.notificationEvent.updateMany).mockResolvedValue({ count: 2 } as never)

    await unreleaseEvent(db, 42, 1, 5)

    expect(db.notificationEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          // congregationId is load-bearing: without it, unreleasing an event
          // would cancel pending notifications for the same entityId across
          // every congregation (RLS catches this today, but we want the
          // service-level filter to be correct on its own).
          congregationId: 1,
          status: 'pending',
          OR: [
            { entityType: 'ProgrammePartAssignment', entityId: { in: [100, 101] } },
            { entityType: 'ProgrammeServiceRoleAssignment', entityId: { in: [200] } },
          ],
        }),
        data: expect.objectContaining({ status: 'cancelled' }),
      }),
    )
  })

  it('audits with action EventUnreleased on success', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...releasedEvent,
      partAssignments: [],
      serviceRoleAssignments: [],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(draftEvent as never)
    vi.mocked(db.notificationEvent.updateMany).mockResolvedValue({ count: 0 } as never)

    await unreleaseEvent(db, 42, 1, 5)

    expect(auditInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        action: AuditAction.EventUnreleased,
        congregationId: 1,
        actorId: 5,
        entityType: 'Event',
        entityId: 42,
      }),
    )
    expect(audit).not.toHaveBeenCalled()
  })
})

describe('bulkReleaseEvents (per-event scope + post-tx notifications)', () => {
  it('classifies each event into released / blocked / notFound / failed', async () => {
    // 10 → not found; 20 → conflict-blocked; 30 → clean release.
    // biome-ignore lint/suspicious/noExplicitAny: mock signature needs to match Prisma's generated overloads
    vi.mocked(db.event.findFirst).mockImplementation(((args: any) => {
      const id = args?.where?.id as number
      if (id === 10) return Promise.resolve(null)
      if (id === 20) {
        return Promise.resolve({
          ...draftEvent,
          id: 20,
          partAssignments: [{ id: 100, name: 'Part', hasConflict: true, assigneeId: 5, assistantId: null }],
          serviceRoleAssignments: [],
        })
      }
      return Promise.resolve({ ...draftEvent, id: 30 })
    }) as never)
    vi.mocked(db.event.update).mockResolvedValue({ ...releasedEvent, id: 30 } as never)

    const result = await bulkReleaseEvents([10, 20, 30], 1, 5, nctx)

    expect(result.released).toEqual([30])
    expect(result.blocked.map((b: { id: number }) => b.id)).toEqual([20])
    expect(result.notFound).toEqual([10])
    expect(result.failed).toEqual([])
  })

  // A Prisma error inside `withScope` (pool exhaustion, connection reset,
  // tx timeout) previously escaped the loop and 500'd the whole batch,
  // silently dropping partial progress. Now each event's release is caught
  // and lands in the `failed` bucket; the loop continues.
  it('lands per-event withScope failures in the `failed` bucket without aborting the batch', async () => {
    const { withScope } = await import('~/shared/infra/db.server')
    // First event succeeds; second event's withScope throws (Prisma error);
    // third event succeeds again.
    vi.mocked(withScope).mockImplementation(((_cid: number, fn: (tx: unknown) => unknown) => fn(db)) as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ ...draftEvent } as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)
    // Poison the second per-event scope call.
    vi.mocked(withScope)
      .mockImplementationOnce((async (_cid: number, fn: (tx: unknown) => unknown) => fn(db)) as never)
      .mockImplementationOnce(() => Promise.reject(new Error('pool exhausted')))
      .mockImplementation((async (_cid: number, fn: (tx: unknown) => unknown) => fn(db)) as never)

    const result = await bulkReleaseEvents([10, 20, 30], 1, 5, nctx)

    expect(result.released).toEqual([10, 30])
    expect(result.failed.map((f: { id: number }) => f.id)).toEqual([20])
  })

  // fireReleaseNotifications runs OUTSIDE the release tx. This test verifies
  // that after a successful release, notifyAssignment is invoked for every
  // computed target.
  it('fires notifyAssignment for each target of every released event', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...draftEvent,
      partAssignments: [{ id: 100, name: 'Perle', hasConflict: false, assigneeId: 5, assistantId: null }],
      serviceRoleAssignments: [],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    await bulkReleaseEvents([42], 1, 5, nctx)

    expect(notifyAssignment).toHaveBeenCalledTimes(1)
    expect(vi.mocked(notifyAssignment).mock.calls[0][2]).toMatchObject({ memberId: 5, role: 'speaker' })
  })

  it('returns empty buckets when the input list is empty', async () => {
    const result = await bulkReleaseEvents([], 1, 5, nctx)
    expect(result).toEqual({ released: [], blocked: [], notFound: [], failed: [] })
    expect(db.event.findFirst).not.toHaveBeenCalled()
  })
})

describe('bulkUnreleaseEvents (per-event scope)', () => {
  it('classifies each event into unreleased / notFound / failed', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock signature needs to match Prisma's generated overloads
    vi.mocked(db.event.findFirst).mockImplementation(((args: any) => {
      const id = args?.where?.id as number
      if (id === 10) return Promise.resolve(null)
      return Promise.resolve({ ...releasedEvent, id, partAssignments: [], serviceRoleAssignments: [] })
    }) as never)
    vi.mocked(db.event.update).mockResolvedValue(draftEvent as never)

    const result = await bulkUnreleaseEvents([10, 20, 30], 1, 5)

    expect(result.unreleased).toEqual([20, 30])
    expect(result.notFound).toEqual([10])
    expect(result.failed).toEqual([])
  })

  it('lands per-event withScope failures in the `failed` bucket without aborting the batch', async () => {
    const { withScope } = await import('~/shared/infra/db.server')
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...releasedEvent,
      partAssignments: [],
      serviceRoleAssignments: [],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(draftEvent as never)
    vi.mocked(withScope)
      .mockImplementationOnce((async (_cid: number, fn: (tx: unknown) => unknown) => fn(db)) as never)
      .mockImplementationOnce(() => Promise.reject(new Error('pool exhausted')))
      .mockImplementation((async (_cid: number, fn: (tx: unknown) => unknown) => fn(db)) as never)

    const result = await bulkUnreleaseEvents([10, 20, 30], 1, 5)

    expect(result.unreleased).toEqual([10, 30])
    expect(result.failed.map((f: { id: number }) => f.id)).toEqual([20])
  })

  it('returns empty buckets when the input list is empty', async () => {
    const result = await bulkUnreleaseEvents([], 1, 5)
    expect(result).toEqual({ unreleased: [], notFound: [], failed: [] })
    expect(db.event.findFirst).not.toHaveBeenCalled()
  })
})
