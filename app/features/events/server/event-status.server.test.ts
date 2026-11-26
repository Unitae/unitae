import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditAction } from '~/shared/domain/audit.server'
import { EVENT_STATUS_ERRORS } from './event-status.policy'

// Schedules are written beside the items (the schedules' expand step); their own tests cover them.
vi.mock('~/features/events/server/schedules.server', () => ({
  attachEventItems: vi.fn(),
  deleteEventSchedules: vi.fn(),
  eventScheduleId: vi.fn(),
  setEventSchedulesStatus: vi.fn(),
}))
vi.mock('~/features/events/server/schedule-templates.server', () => ({
  deleteTemplateScheduleTemplates: vi.fn(),
  syncTemplateScheduleTemplates: vi.fn(),
}))

vi.mock('~/shared/infra/db.server', () => {
  const unscopedDb = {
    event: { findFirst: vi.fn(), update: vi.fn() },
    item: { findMany: vi.fn() },
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

const { releaseEvent, unreleaseEvent, fireReleaseNotifications, fireCancellationNotifications } = await import(
  './event-status.server'
)
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
}
const releasedEvent = { ...draftEvent, status: 'released' }

type ItemFixture = { parts?: unknown[]; services?: unknown[]; legacy?: unknown[] }
type ItemArgs = {
  where: { eventId?: number; AND?: { schedule: { kind: string } }[] }
  select?: Record<string, boolean>
}

/**
 * Feeds the item reads of the event flow, per event. releaseEvent asks for the programme's parts, then the duties (kind
 * in `AND`); unreleaseEvent asks for every item id of the event (no kind); the notice cancel reads the legacy keys.
 */
function mockItems(byEvent: Record<number, ItemFixture> = {}) {
  vi.mocked(db.item.findMany).mockImplementation(((args: ItemArgs) => {
    if (args.select && 'legacyPartId' in args.select) {
      return Object.values(byEvent).flatMap(entry => entry.legacy ?? [])
    }
    const entry = byEvent[args.where.eventId ?? -1] ?? {}
    const kind = args.where.AND?.[0]?.schedule?.kind
    if (kind === 'programme') return entry.parts ?? []
    if (kind === 'duty') return entry.services ?? []
    return [...(entry.parts ?? []), ...(entry.services ?? [])]
  }) as never)
}

beforeEach(() => {
  vi.resetAllMocks()
  mockItems()
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
    expect(result).toEqual({ event: { ...releasedEvent, eventParts: [], eventServiceParts: [] }, notifyTargets: [] })
    expect(db.event.update).not.toHaveBeenCalled()
  })

  it('returns an error and does not update when any assignment has a conflict', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({ ...draftEvent } as never)
    mockItems({ 42: { parts: [{ id: 100, name: 'Perle', hasConflict: true, assigneeId: 5, assistantId: null }] } })

    const result = await releaseEvent(db, 42, 1, 5)

    expect(result).toEqual({
      error: expect.stringContaining(EVENT_STATUS_ERRORS.releaseBlockedByConflicts),
      reason: 'conflicts',
    })
    expect(db.event.update).not.toHaveBeenCalled()
  })

  // A meeting created ahead has nothing to publish yet; « Autre évènement » may be published empty.
  it('refuses a meeting still waiting for its programme, but not an empty other event', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...draftEvent,
      template: {
        key: 'midweek-meeting',
        scheduleTemplates: [{ scheduleTemplate: { _count: { parts: 12, serviceParts: 4 } } }],
      },
    } as never)

    expect(await releaseEvent(db, 42, 1, 5)).toEqual({
      error: EVENT_STATUS_ERRORS.releaseAwaitingProgramme,
      reason: 'awaiting',
    })
    expect(db.event.update).not.toHaveBeenCalled()

    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...draftEvent,
      template: {
        key: 'freeform',
        scheduleTemplates: [{ scheduleTemplate: { _count: { parts: 12, serviceParts: 4 } } }],
      },
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)
    expect(await releaseEvent(db, 42, 1, 5)).toMatchObject({ event: releasedEvent })
  })

  // A template that only puts an event on the calendar: its events are published empty, as before.
  it('publishes an empty event of a template with neither parts nor services', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...draftEvent,
      template: { key: null, scheduleTemplates: [{ scheduleTemplate: { _count: { parts: 0, serviceParts: 0 } } }] },
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    expect(await releaseEvent(db, 42, 1, 5)).toMatchObject({ event: releasedEvent })
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
    vi.mocked(db.event.findFirst).mockResolvedValue({ ...draftEvent } as never)
    mockItems({
      42: {
        parts: [{ id: 100, name: 'Perle', hasConflict: false, assigneeId: 5, assistantId: 6 }],
        services: [{ id: 200, name: 'Accueil', hasConflict: false, assigneeId: 9 }],
      },
    })
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    await releaseEvent(db, 42, 1, 5)

    expect(notifyAssignment).not.toHaveBeenCalled()
  })

  it('computes notifyTargets for every populated speaker/reader/servant slot', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({ ...draftEvent } as never)
    mockItems({
      42: {
        parts: [{ id: 100, name: 'Perle', hasConflict: false, assigneeId: 5, assistantId: 6 }],
        services: [{ id: 200, name: 'Accueil', hasConflict: false, assigneeId: 9 }],
      },
    })
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    const result = await releaseEvent(db, 42, 1, 5)

    expect(result).toMatchObject({
      notifyTargets: [
        { entityType: 'Item', entityId: 100, assignmentName: 'Perle', memberId: 5, role: 'speaker' },
        { entityType: 'Item', entityId: 100, assignmentName: 'Perle', memberId: 6, role: 'reader' },
        {
          entityType: 'Item',
          entityId: 200,
          assignmentName: 'Accueil',
          memberId: 9,
          role: 'servant',
        },
      ],
    })
  })

  it('excludes empty slots from notifyTargets', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({ ...draftEvent } as never)
    mockItems({
      42: {
        parts: [{ id: 100, name: 'Perle', hasConflict: false, assigneeId: null, assistantId: null }],
        services: [{ id: 200, name: 'Accueil', hasConflict: false, assigneeId: null }],
      },
    })
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
    entityType: 'Item' as const,
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

  it('tells each target « Attribution annulée » when a published schedule is deleted (D41)', async () => {
    await fireCancellationNotifications(eventShape, [speakerTarget, readerTarget], 1, 5, nctx)
    const types = vi.mocked(notifyAssignment).mock.calls.map(call => call[2].type)
    expect(types).toEqual(['programme.assignment.unassigned', 'programme.assignment.unassigned'])
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
          entityType: 'Item' as const,
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
      entityType: 'Item',
      entityId: 100,
      assignmentName: 'Perle',
    })
    expect(svcCtx).toMatchObject({
      entityType: 'Item',
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
    vi.mocked(db.event.findFirst).mockResolvedValue(releasedEvent as never)
    vi.mocked(db.event.update).mockResolvedValue(draftEvent as never)

    await unreleaseEvent(db, 42, 1, 5)

    expect(db.notificationEvent.updateMany).not.toHaveBeenCalled()
  })

  it('flips status back to draft and returns the updated event', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(releasedEvent as never)
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
    vi.mocked(db.event.findFirst).mockResolvedValue(releasedEvent as never)
    // Items 1001, 1002 and 2001 mirror the old rows 100, 101 and 200: a notice the previous image wrote may name
    // either.
    mockItems({
      42: {
        parts: [{ id: 1001 }, { id: 1002 }],
        services: [{ id: 2001 }],
        legacy: [
          { legacyPartId: 100, legacyServiceId: null },
          { legacyPartId: 101, legacyServiceId: null },
          { legacyPartId: null, legacyServiceId: 200 },
        ],
      },
    })
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
            { entityType: 'Item', entityId: { in: [1001, 1002, 2001] } },
            { entityType: 'EventPart', entityId: { in: [100, 101] } },
            { entityType: 'EventServicePart', entityId: { in: [200] } },
          ],
        }),
        data: expect.objectContaining({ status: 'cancelled' }),
      }),
    )
  })

  it('audits with action EventUnreleased on success', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(releasedEvent as never)
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
