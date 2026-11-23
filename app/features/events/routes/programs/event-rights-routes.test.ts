import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as m from '~/i18n/paraglide/messages'

// Each event-level route asks its own rule (plan §10, D28, D43, D50): deleting asks canDeleteEvent and the bulk delete
// 'delete'; publishing and unpublishing go through publishEvent / unpublishEvent, which decide schedule by schedule and
// refuse whoever may publish none of the event, and the bulk routes report events refused that way. The rules are
// faked to give different answers (their integration tests own them), so a route asking the wrong one fails here.
// What each route does once allowed is faked too, and recorded.

const { state } = vi.hoisted(() => ({
  state: {
    /** What each fake rule answers. */
    answers: { change: false, delete: false, publish: false },
    /** What « Tout publier » returns beyond the defaults, for the messages it leads to. */
    publishOutcome: {} as Record<string, unknown>,
    /** The rights 'filterEventsByRight' keeps every id for. */
    bulk: [] as ('publish' | 'delete')[],
    done: [] as string[],
    flashed: [] as string[],
  },
}))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn({}),
}))

vi.mock('~/features/authentication/index.server', () => ({
  getSession: () => Promise.resolve({ flash: (kind: string, text: string) => state.flashed.push(`${kind}:${text}`) }),
  commitSession: () => Promise.resolve(''),
}))

vi.mock('~/features/events/server/programme-event.queries', () => ({
  findProgrammeEvent: () => Promise.resolve({ id: 40, templateId: 3, name: 'Réunion', status: 'draft' }),
}))

const publishedEvent = { id: 40, name: 'Réunion', startDate: new Date(2027, 2, 3), templateId: 3 }

vi.mock('~/features/events/server/event-publishing.server', () => ({
  publishEvent: () => {
    if (!state.answers.publish) return Promise.resolve({ refused: true })
    state.done.push('release')
    return Promise.resolve({
      event: publishedEvent,
      changed: true,
      published: [],
      blocked: [],
      skipped: 0,
      notifyTargets: [],
      ...state.publishOutcome,
    })
  },
  publishEventSchedule: () => {
    if (!state.answers.publish) return Promise.resolve({ refused: true })
    state.done.push('schedule-publish')
    return Promise.resolve({ event: publishedEvent, result: { schedule: { id: 7 }, changed: true, notifyTargets: [] } })
  },
  unpublishEventSchedule: () => {
    if (!state.answers.publish) return Promise.resolve({ refused: true })
    state.done.push('schedule-unpublish')
    return Promise.resolve({ event: publishedEvent, result: { schedule: { id: 7 }, changed: true } })
  },
  unpublishEvent: () => {
    if (!state.answers.publish) return Promise.resolve({ refused: true })
    state.done.push('unrelease')
    return Promise.resolve({ changed: true, withdrawn: [], skipped: 0 })
  },
}))

vi.mock('~/features/events/server/schedule-rights.server', () => ({
  canChangeEvent: () => Promise.resolve(state.answers.change),
  canDeleteEvent: () => Promise.resolve(state.answers.delete),
  canPublishEvent: () => Promise.resolve(state.answers.publish),
  filterEventsByRight: (
    _db: unknown,
    _can: unknown,
    ids: number[],
    _user: number,
    _cong: number,
    right: 'publish' | 'delete',
  ) => Promise.resolve(state.bulk.includes(right) ? ids : []),
}))

vi.mock('~/features/events/server/events-auth.server', () => ({ canManageAnyProgram: () => Promise.resolve(true) }))

vi.mock('~/features/events/server/delete-events.server', () => ({
  deleteEvent: () => {
    state.done.push('delete')
    return Promise.resolve({ kept: false })
  },
  bulkDeleteEvents: (_db: unknown, ids: number[]) => {
    state.done.push(`bulk-delete:${ids.length}`)
    return Promise.resolve({ count: ids.length, emptied: 0 })
  },
}))

vi.mock('~/features/events/server/event-status.server', () => ({ fireReleaseNotifications: () => Promise.resolve() }))

// The bulk routes publish or withdraw each event as « Tout publier » / « Tout retirer »; refused when the bulk rule
// does not keep 'publish' for this test.
vi.mock('~/features/events/server/event-status-bulk.server', () => ({
  bulkReleaseEvents: (ids: number[]) => {
    const kept = state.bulk.includes('publish')
    if (kept) state.done.push(`bulk-release:${ids.length}`)
    return Promise.resolve({
      released: kept ? ids : [],
      blocked: [],
      awaiting: [],
      refused: kept ? [] : ids,
      notFound: [],
      failed: [],
      heldSchedules: 0,
      conflictedSchedules: 0,
    })
  },
  bulkUnreleaseEvents: (ids: number[]) => {
    const kept = state.bulk.includes('publish')
    if (kept) state.done.push(`bulk-unrelease:${ids.length}`)
    return Promise.resolve({
      unreleased: kept ? ids : [],
      refused: kept ? [] : ids,
      notFound: [],
      failed: [],
      heldSchedules: 0,
    })
  },
}))

const { respond, routeContext } = await import('~/tests/helpers/route-action')
const deleteRoute = await import('./events/delete')
const releaseRoute = await import('./events/release')
const unreleaseRoute = await import('./events/unrelease')
const bulkDelete = await import('./bulk-delete')
const bulkRelease = await import('./bulk-release')
const bulkUnrelease = await import('./bulk-unrelease')
const schedulePublish = await import('./events/schedule-publish')
const scheduleUnpublish = await import('./events/schedule-unpublish')

type Action = (args: never) => Promise<unknown>

const ERROR_FLASH = /^error:/

function post(action: Action, url: string, body?: unknown) {
  return action({
    request: new Request(`https://unitae.example.test${url}`, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    }),
    params: { eventId: '40', scheduleId: '7' },
    context: routeContext([]),
  } as never)
}

beforeEach(() => {
  state.answers = { change: false, delete: false, publish: false }
  state.bulk = []
  state.publishOutcome = {}
  state.done = []
  state.flashed = []
})

describe('deleting an event asks canDeleteEvent alone', () => {
  it('deletes for whoever it allows, even refused the other rules', async () => {
    state.answers.delete = true
    await respond(() => post(deleteRoute.action as Action, '/programs/events/40/delete'))
    expect(state.done).toEqual(['delete'])
  })

  it('refuses whoever it refuses, even allowed to change and publish the event', async () => {
    state.answers = { change: true, delete: false, publish: true }
    const response = await respond(() => post(deleteRoute.action as Action, '/programs/events/40/delete'))
    expect(response.headers.get('Location')).toBe('/programs')
    expect(state.done).toEqual([])
  })
})

describe.each([
  { name: 'publishing', action: releaseRoute.action as Action, url: '/programs/events/40/release', did: 'release' },
  {
    name: 'unpublishing',
    action: unreleaseRoute.action as Action,
    url: '/programs/events/40/unrelease',
    did: 'unrelease',
  },
])('$name an event goes by the schedules the person may publish', ({ action, url, did }) => {
  it('goes through for whoever may publish some of its schedules', async () => {
    state.answers.publish = true
    await post(action, url)
    expect(state.done).toEqual([did])
  })

  it('refuses whoever may publish none of them, even allowed to change and delete the event', async () => {
    state.answers = { change: true, delete: true, publish: false }
    const response = await respond(() => post(action, url))
    expect(response.headers.get('Location')).toBe('/programs')
    expect(state.done).toEqual([])
  })
})

describe('« Tout publier » says what stayed a draft, schedule by schedule', () => {
  const conflict = (kind: string) => ({
    schedule: { id: 1, kind },
    reason: 'conflicts',
    error: 'Impossible : cet évènement…',
  })

  it('reports the duties published and the programme its conflicts held back, never the event’s refusal', async () => {
    state.answers.publish = true
    state.publishOutcome = { blocked: [conflict('programme')] }
    await post(releaseRoute.action as Action, '/programs/events/40/release')
    expect(state.flashed).toEqual([
      `success:${m.programs_release_success()}`,
      `error:${m.programs_schedules_conflicted({ count: 1 })}`,
    ])
  })

  it('counts two held schedules once, and refuses when nothing was published', async () => {
    state.answers.publish = true
    state.publishOutcome = { changed: false, blocked: [conflict('programme'), conflict('duty')] }
    const response = await post(releaseRoute.action as Action, '/programs/events/40/release')
    expect(response).toMatchObject({ data: { ok: false } })
    expect(state.flashed).toEqual([`error:${m.programs_schedules_conflicted({ count: 2 })}`])
  })
})

describe.each([
  { name: 'publishing', action: schedulePublish.action as Action, did: 'schedule-publish' },
  { name: 'withdrawing', action: scheduleUnpublish.action as Action, did: 'schedule-unpublish' },
])('$name one schedule asks its own right', ({ action, did }) => {
  it('goes through for whoever may publish it', async () => {
    state.answers.publish = true
    await post(action, '/programs/events/40/schedules/7/publish')
    expect(state.done).toEqual([did])
  })

  it('refuses whoever may not, even allowed to change and delete the event', async () => {
    state.answers = { change: true, delete: true, publish: false }
    const response = await respond(() => post(action, '/programs/events/40/schedules/7/publish'))
    expect(response.headers.get('Location')).toBe('/programs')
    expect(state.done).toEqual([])
  })
})

describe('the bulk routes ask their own right', () => {
  it('deletes what the delete rule keeps, and says so when it keeps nothing', async () => {
    state.bulk = ['delete']
    await post(bulkDelete.action as Action, '/programs/bulk-delete', { ids: [40, 41] })
    expect(state.done).toEqual(['bulk-delete:2'])

    state.bulk = ['publish']
    state.done = []
    state.flashed = []
    const refused = await post(bulkDelete.action as Action, '/programs/bulk-delete', { ids: [40, 41] })
    expect(state.done).toEqual([])
    expect(refused).toMatchObject({ data: { ok: false } })
    expect(state.flashed).toHaveLength(1)
    expect(state.flashed[0]).toMatch(ERROR_FLASH)
  })

  it.each([
    { name: 'publishes', action: bulkRelease.action as Action, url: '/programs/bulk-release', did: 'bulk-release:2' },
    {
      name: 'unpublishes',
      action: bulkUnrelease.action as Action,
      url: '/programs/bulk-unrelease',
      did: 'bulk-unrelease:2',
    },
  ])('$name what the publish rule keeps, never what the delete rule keeps', async ({ action, url, did }) => {
    state.bulk = ['publish']
    await post(action, url, { ids: [40, 41] })
    expect(state.done).toEqual([did])

    state.bulk = ['delete']
    state.done = []
    state.flashed = []
    await post(action, url, { ids: [40, 41] })
    expect(state.done).toEqual([])
    expect(state.flashed[0]).toMatch(ERROR_FLASH)
  })
})
