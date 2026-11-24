import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

// The preview of bulk « Publier » keeps bulk-release's gate: whoever may publish nothing anywhere is sent back to the
// list, and nothing is read for them; otherwise it answers what bulkPublishPreview says for the ids posted.

const state = { managesSome: false, asked: [] as number[][] }

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn({}),
}))
vi.mock('~/features/events/server/events-auth.server', () => ({
  canManageAnyProgram: () => Promise.resolve(state.managesSome),
}))
vi.mock('~/features/events/server/bulk-publish-preview.queries', () => ({
  bulkPublishPreview: (_db: unknown, _can: unknown, _userId: number, ids: number[]) => {
    state.asked.push(ids)
    return Promise.resolve({ publish: [], marker: 'preview' })
  },
}))

const { respond, routeContext } = await import('~/tests/helpers/route-action')
const { action } = await import('./bulk-release-preview')

const post = (permissions: Permission[], body: unknown) =>
  action({
    request: new Request('http://localhost/programs/bulk-release-preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    context: routeContext(permissions),
    params: {},
  } as never)

beforeEach(() => {
  state.managesSome = false
  state.asked = []
})

describe('bulk-release-preview', () => {
  it('answers the preview of the ids posted, for whoever may publish programmes', async () => {
    expect(await post([Permission.CanPublishPrograms], { ids: [40, 41] })).toEqual({
      ok: true,
      preview: { publish: [], marker: 'preview' },
    })
    expect(state.asked).toEqual([[40, 41]])
  })

  it('answers a responsible of some schedule template too', async () => {
    state.managesSome = true
    expect(await post([], { ids: [40] })).toMatchObject({ ok: true })
  })

  it('sends whoever may publish nothing back to the list, reading nothing', async () => {
    const response = await respond(() => post([Permission.CanViewPrograms], { ids: [40] }))
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/programs')
    expect(state.asked).toEqual([])
  })

  it('refuses a payload that is not a list of ids', async () => {
    expect(await post([Permission.CanPublishPrograms], { ids: 'all' })).toEqual({ ok: false, error: 'invalid_payload' })
    expect(state.asked).toEqual([])
  })
})
