import { beforeEach, describe, expect, it, vi } from 'vitest'

// The publisher create and edit pages require CanManagePublishers. Their actions must enforce it too:
// React Router runs only the leaf action on a submission, so the page's loader check never applies.
// Members are kept in an in-memory store, so the tests assert on whether one was written.

const { members } = vi.hoisted(() => ({ members: new Map<number, { firstname: string; lastname: string }>() }))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown, congregationId: number) => unknown) => fn({}, 1),
}))

vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn(async () => ({ flash: vi.fn() })),
  commitSession: vi.fn(async () => '__session=committed'),
}))

vi.mock('~/features/publishers/server/create-member.server', () => ({
  createMember: vi.fn(async (_db: unknown, _congregation: unknown, input: { firstname: string; lastname: string }) => {
    const id = members.size + 100
    members.set(id, { firstname: input.firstname, lastname: input.lastname })
    return { id, firstname: input.firstname }
  }),
}))

vi.mock('~/features/publishers/server/update-member.server', () => ({
  updateMember: vi.fn(
    async (_db: unknown, id: number, _c: number, _a: number, input: { firstname: string; lastname: string }) => {
      members.set(id, { firstname: input.firstname, lastname: input.lastname })
      return { id, firstname: input.firstname }
    },
  ),
}))

const { Permission } = await import('~/shared/types/permission')
const { formRequest, respond, routeContext } = await import('~/tests/helpers/route-action')
const newPublisher = await import('./new-publisher')
const editPublisher = await import('./edit-publisher')

const PUBLISHER_FORM = { firstname: 'Mallory', lastname: 'Intruder', gender: 'male', phone: '', address: '' }

beforeEach(() => {
  members.clear()
  members.set(42, { firstname: 'Jean', lastname: 'Dupont' })
})

describe('new-publisher action', () => {
  it('creates the member for a caller who manages publishers', async () => {
    const response = await respond(() =>
      newPublisher.action({
        request: formRequest('https://unitae.example.test/publishers/new', PUBLISHER_FORM),
        params: {},
        context: routeContext([Permission.CanManagePublishers]),
      } as never),
    )

    expect(response.status).toBe(302)
    expect([...members.values()]).toContainEqual({ firstname: 'Mallory', lastname: 'Intruder' })
  })

  it('refuses a caller without CanManagePublishers, without creating anything', async () => {
    const response = await respond(() =>
      newPublisher.action({
        request: formRequest('https://unitae.example.test/publishers/new', PUBLISHER_FORM),
        params: {},
        context: routeContext([Permission.CanViewPublishers]),
      } as never),
    )

    expect(response.headers.get('Location')).toBe('/')
    expect(members.size).toBe(1)
  })
})

describe('edit-publisher action', () => {
  it('updates the member for a caller who manages publishers', async () => {
    await respond(() =>
      editPublisher.action({
        request: formRequest('https://unitae.example.test/publishers/42/edit', PUBLISHER_FORM),
        params: { publisherId: '42' },
        context: routeContext([Permission.CanManagePublishers]),
      } as never),
    )

    expect(members.get(42)).toEqual({ firstname: 'Mallory', lastname: 'Intruder' })
  })

  it('refuses a caller without CanManagePublishers, leaving the member unchanged', async () => {
    const response = await respond(() =>
      editPublisher.action({
        request: formRequest('https://unitae.example.test/publishers/42/edit', PUBLISHER_FORM),
        params: { publisherId: '42' },
        context: routeContext([Permission.CanViewPublishers]),
      } as never),
    )

    expect(response.headers.get('Location')).toBe('/')
    expect(members.get(42)).toEqual({ firstname: 'Jean', lastname: 'Dupont' })
  })
})
