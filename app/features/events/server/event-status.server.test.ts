import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditAction } from '~/shared/domain/audit.server'
import { EVENT_STATUS_ERRORS } from './event-status.policy'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findFirst: vi.fn(), update: vi.fn() },
    programmePartAssignment: { findMany: vi.fn() },
    programmeServiceRoleAssignment: { findMany: vi.fn() },
    notificationEvent: { updateMany: vi.fn() },
    userAccount: { findFirst: vi.fn() },
    notificationEvent$: {},
  },
}))

vi.mock('~/shared/domain/audit.server', async importOriginal => {
  const actual = await importOriginal<typeof import('~/shared/domain/audit.server')>()
  return { ...actual, audit: vi.fn(), auditInTransaction: vi.fn() }
})

vi.mock('./notify-assignment.server', async importOriginal => {
  const actual = await importOriginal<typeof import('./notify-assignment.server')>()
  return { ...actual, notifyAssignment: vi.fn() }
})

const { releaseEvent, unreleaseEvent, bulkReleaseEvents, bulkUnreleaseEvents } = await import('./event-status.server')
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

describe('releaseEvent', () => {
  it('returns null when the event does not exist', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    const result = await releaseEvent(db, 999, 1, 5, nctx)
    expect(result).toBeNull()
  })

  it('is a no-op when the event is already released', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(releasedEvent as never)
    const result = await releaseEvent(db, 42, 1, 5, nctx)
    expect(result).toEqual({ event: releasedEvent })
    expect(db.event.update).not.toHaveBeenCalled()
    expect(notifyAssignment).not.toHaveBeenCalled()
  })

  it('returns an error and does not update when any assignment has a conflict', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...draftEvent,
      partAssignments: [
        {
          name: 'Perle spirituelle',
          hasConflict: true,
          assignee: { firstname: 'Jean', lastname: 'Dupont' },
          assistant: null,
          assigneeId: 5,
        },
      ],
      serviceRoleAssignments: [],
    } as never)

    const result = await releaseEvent(db, 42, 1, 5, nctx)

    expect(result).toEqual({ error: expect.stringContaining(EVENT_STATUS_ERRORS.releaseBlockedByConflicts) })
    expect(db.event.update).not.toHaveBeenCalled()
    expect(notifyAssignment).not.toHaveBeenCalled()
  })

  it('flips status to released and returns the updated event when nothing conflicts', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(draftEvent as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    const result = await releaseEvent(db, 42, 1, 5, nctx)

    expect(result).toEqual({ event: releasedEvent })
    expect(db.event.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'released' } }))
  })

  it('audits with action EventReleased on success', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue(draftEvent as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    await releaseEvent(db, 42, 1, 5, nctx)

    // Must use auditInTransaction (writes on the tx client) so the audit
    // rolls back with the release if the tx aborts later. audit() writes on
    // unscopedDb, escaping the tx and leaving phantom rows on rollback.
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

  it('enqueues an assigned notification for every current part assignee (speaker and reader)', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...draftEvent,
      partAssignments: [
        {
          id: 100,
          name: 'Perle spirituelle',
          hasConflict: false,
          assigneeId: 5,
          assistantId: 6,
          assignee: { firstname: 'A', lastname: 'B' },
          assistant: { firstname: 'C', lastname: 'D' },
        },
      ],
      serviceRoleAssignments: [],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    await releaseEvent(db, 42, 1, 5, nctx)

    // Both slots dispatched — speaker (5) + reader (6). External speakers are
    // not `Member`s and route through a different path, so they aren't
    // notified here.
    expect(notifyAssignment).toHaveBeenCalledTimes(2)
    const calls = vi.mocked(notifyAssignment).mock.calls
    expect(calls[0][2]).toMatchObject({ memberId: 5, role: 'speaker' })
    expect(calls[1][2]).toMatchObject({ memberId: 6, role: 'reader' })
  })

  it('enqueues an assigned notification for every current service-role assignee', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...draftEvent,
      partAssignments: [],
      serviceRoleAssignments: [
        {
          id: 200,
          name: 'Accueil',
          hasConflict: false,
          assigneeId: 9,
          assignee: { firstname: 'X', lastname: 'Y' },
        },
      ],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    await releaseEvent(db, 42, 1, 5, nctx)

    expect(notifyAssignment).toHaveBeenCalledTimes(1)
    const call = vi.mocked(notifyAssignment).mock.calls[0]
    expect(call[2]).toMatchObject({ memberId: 9, role: 'servant' })
  })

  it('does not enqueue notifications for slots that have no assignee (empty draft slot)', async () => {
    vi.mocked(db.event.findFirst).mockResolvedValue({
      ...draftEvent,
      partAssignments: [
        {
          id: 100,
          name: 'Perle spirituelle',
          hasConflict: false,
          assigneeId: null,
          assistantId: null,
          assignee: null,
          assistant: null,
        },
      ],
      serviceRoleAssignments: [{ id: 200, name: 'Accueil', hasConflict: false, assigneeId: null, assignee: null }],
    } as never)
    vi.mocked(db.event.update).mockResolvedValue(releasedEvent as never)

    await releaseEvent(db, 42, 1, 5, nctx)

    expect(notifyAssignment).not.toHaveBeenCalled()
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

describe('bulkReleaseEvents', () => {
  it('classifies each event into released / blocked / null-skipped', async () => {
    // Event 10 → not found. Event 20 → conflict. Event 30 → clean release.
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

    const result = await bulkReleaseEvents(db, [10, 20, 30], 1, 5, nctx)

    expect(result.released).toEqual([30])
    expect(result.blocked.map((b: { id: number }) => b.id)).toEqual([20])
    expect(result.notFound).toEqual([10])
  })

  it('returns empty buckets when the input list is empty', async () => {
    const result = await bulkReleaseEvents(db, [], 1, 5, nctx)
    expect(result).toEqual({ released: [], blocked: [], notFound: [] })
    expect(db.event.findFirst).not.toHaveBeenCalled()
  })
})

describe('bulkUnreleaseEvents', () => {
  it('classifies each event into unreleased / null-skipped', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock signature needs to match Prisma's generated overloads
    vi.mocked(db.event.findFirst).mockImplementation(((args: any) => {
      const id = args?.where?.id as number
      if (id === 10) return Promise.resolve(null)
      return Promise.resolve({
        ...releasedEvent,
        id,
        partAssignments: [],
        serviceRoleAssignments: [],
      })
    }) as never)
    vi.mocked(db.event.update).mockResolvedValue(draftEvent as never)

    const result = await bulkUnreleaseEvents(db, [10, 20, 30], 1, 5)

    expect(result.unreleased).toEqual([20, 30])
    expect(result.notFound).toEqual([10])
  })

  it('returns empty buckets when the input list is empty', async () => {
    const result = await bulkUnreleaseEvents(db, [], 1, 5)
    expect(result).toEqual({ unreleased: [], notFound: [] })
    expect(db.event.findFirst).not.toHaveBeenCalled()
  })
})
