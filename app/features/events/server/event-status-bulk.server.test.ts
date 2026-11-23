import { beforeEach, describe, expect, it, vi } from 'vitest'

// The bulk routes act as « Tout publier » / « Tout retirer » on each selected event (D43), each in its own
// transaction; how each event's schedules publish is publishEvent's own integration test. Here: the buckets the page
// reports, the notices fired after each event's transaction, and a failing event never stopping the loop.

const state = vi.hoisted(() => ({
  publish: new Map<number, unknown>(),
  unpublish: new Map<number, unknown>(),
}))

vi.mock('~/shared/infra/db.server', () => ({
  withScope: vi.fn(async (_congregationId: number, fn: (tx: unknown) => unknown) => fn({})),
}))

vi.mock('./event-publishing.server', () => ({
  publishEvent: (_db: unknown, _can: unknown, _user: number, eventId: number) => {
    const outcome = state.publish.get(eventId)
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome ?? null)
  },
  unpublishEvent: (_db: unknown, _can: unknown, _user: number, eventId: number) => {
    const outcome = state.unpublish.get(eventId)
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome ?? null)
  },
}))

vi.mock('./event-status.server', () => ({ fireReleaseNotifications: vi.fn() }))

const { bulkReleaseEvents, bulkUnreleaseEvents } = await import('./event-status-bulk.server')
const { fireReleaseNotifications } = await import('./event-status.server')

const nctx = { locale: 'fr', timezone: 'Europe/Paris' }
const can = () => true
const event = (id: number) => ({ id, name: 'Réunion', startDate: new Date(2027, 2, 3), templateId: 7 })
const published = (id: number, extra: Record<string, unknown> = {}) => ({
  event: event(id),
  changed: true,
  published: [{ id: id * 10, eventId: id, kind: 'duty' }],
  blocked: [],
  skipped: 0,
  notifyTargets: [{ entityType: 'Item', entityId: 1, assignmentName: 'Sono', memberId: 5, role: 'servant' }],
  ...extra,
})

beforeEach(() => {
  state.publish.clear()
  state.unpublish.clear()
  vi.mocked(fireReleaseNotifications).mockClear()
})

describe('bulkReleaseEvents', () => {
  it('sorts each event into what the page reports, and counts the schedules left to someone else', async () => {
    state.publish.set(1, published(1))
    state.publish.set(2, published(2, { skipped: 1 }))
    state.publish.set(3, { refused: true })
    state.publish.set(
      4,
      published(4, { changed: false, published: [], blocked: [{ reason: 'conflicts', error: 'x' }] }),
    )
    state.publish.set(5, published(5, { changed: false, published: [], blocked: [{ reason: 'awaiting', error: 'y' }] }))
    state.publish.set(7, new Error('boom'))
    // Its duties published, its programme held back by a conflict; another's programme still to give.
    state.publish.set(8, published(8, { blocked: [{ reason: 'conflicts', error: 'x' }] }))
    state.publish.set(9, published(9, { blocked: [{ reason: 'awaiting', error: 'y' }] }))

    const result = await bulkReleaseEvents([1, 2, 3, 4, 5, 6, 7, 8, 9], can, 9, 1, nctx)

    expect(result).toEqual({
      released: [1, 2, 8, 9],
      blocked: [{ id: 4, error: 'x' }],
      awaiting: [5, 9],
      refused: [3],
      notFound: [6],
      failed: [{ id: 7, error: 'boom' }],
      heldSchedules: 1,
      conflictedSchedules: 1,
    })
  })

  it('counts an event published already, nothing left to publish, as published', async () => {
    state.publish.set(1, published(1, { changed: false, published: [], notifyTargets: [] }))
    expect((await bulkReleaseEvents([1], can, 9, 1, nctx)).released).toEqual([1])
  })

  it('fires each published event’s notices after its own transaction', async () => {
    state.publish.set(1, published(1))
    state.publish.set(3, { refused: true })

    await bulkReleaseEvents([1, 3], can, 9, 1, nctx)

    expect(vi.mocked(fireReleaseNotifications).mock.calls).toEqual([[event(1), published(1).notifyTargets, 1, 9, nctx]])
  })
})

describe('bulkUnreleaseEvents', () => {
  it('sorts each event into what the page reports, and counts the schedules left published', async () => {
    state.unpublish.set(1, { changed: true, withdrawn: [{ id: 10 }], skipped: 0 })
    state.unpublish.set(2, { changed: true, withdrawn: [{ id: 20 }], skipped: 1 })
    state.unpublish.set(3, { refused: true })
    state.unpublish.set(5, new Error('boom'))

    expect(await bulkUnreleaseEvents([1, 2, 3, 4, 5], can, 9, 1)).toEqual({
      unreleased: [1, 2],
      refused: [3],
      notFound: [4],
      failed: [{ id: 5, error: 'boom' }],
      heldSchedules: 1,
    })
  })
})
