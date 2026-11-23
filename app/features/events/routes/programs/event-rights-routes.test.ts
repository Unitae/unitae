import { beforeEach, describe, expect, it, vi } from 'vitest'

// Each event-level route asks its own rule (plan §10, D28, D49, D50): deleting asks canDeleteEvent and the bulk delete
// 'delete', publishing and unpublishing ask canPublishEvent and the bulk routes 'publish'. The rules are faked to give
// different answers (their integration test owns them), so a route asking the wrong one fails here. What each route
// does once allowed is faked too, and recorded.

const { state } = vi.hoisted(() => ({
  state: {
    /** What each fake rule answers. */
    answers: { change: false, delete: false, publish: false },
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

vi.mock('~/features/events/server/event-status.server', () => ({
  releaseEvent: () => {
    state.done.push('release')
    return Promise.resolve({ event: { id: 40 }, notifyTargets: [] })
  },
  fireReleaseNotifications: () => Promise.resolve(),
  unreleaseEvent: () => {
    state.done.push('unrelease')
    return Promise.resolve({ event: { id: 40 } })
  },
}))

vi.mock('~/features/events/server/event-status-bulk.server', () => ({
  bulkReleaseEvents: (ids: number[]) => {
    state.done.push(`bulk-release:${ids.length}`)
    return Promise.resolve({ released: ids, blocked: [], awaiting: [], notFound: [], failed: [] })
  },
  bulkUnreleaseEvents: (ids: number[]) => {
    state.done.push(`bulk-unrelease:${ids.length}`)
    return Promise.resolve({ unreleased: ids, notFound: [], failed: [] })
  },
}))

const { respond, routeContext } = await import('~/tests/helpers/route-action')
const deleteRoute = await import('./events/delete')
const releaseRoute = await import('./events/release')
const unreleaseRoute = await import('./events/unrelease')
const bulkDelete = await import('./bulk-delete')
const bulkRelease = await import('./bulk-release')
const bulkUnrelease = await import('./bulk-unrelease')

type Action = (args: never) => Promise<unknown>

const ERROR_FLASH = /^error:/

function post(action: Action, url: string, body?: unknown) {
  return action({
    request: new Request(`https://unitae.example.test${url}`, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    }),
    params: { eventId: '40' },
    context: routeContext([]),
  } as never)
}

beforeEach(() => {
  state.answers = { change: false, delete: false, publish: false }
  state.bulk = []
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
])('$name an event asks canPublishEvent alone', ({ action, url, did }) => {
  it('goes through for whoever it allows', async () => {
    state.answers.publish = true
    await post(action, url)
    expect(state.done).toEqual([did])
  })

  it('refuses whoever it refuses, even allowed to change and delete the event', async () => {
    state.answers = { change: true, delete: true, publish: false }
    const response = await respond(() => post(action, url))
    expect(response.headers.get('Location')).toBe('/programs')
    expect(state.done).toEqual([])
  })
})

describe('the bulk routes ask filterEventsByRight for their own right', () => {
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
