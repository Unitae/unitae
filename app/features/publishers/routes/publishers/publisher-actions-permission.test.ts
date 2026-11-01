import { beforeEach, describe, expect, it, vi } from 'vitest'

// The publisher create and edit pages require CanManagePublishers. Their actions must enforce it too:
// React Router runs only the leaf action on a submission, so the page's loader check never applies.
// Members are kept in an in-memory store, so the tests assert on whether one was written.

const { members, arrivals } = vi.hoisted(() => ({
  members: new Map<number, { firstname: string; lastname: string }>(),
  // The arrival date each write was given: left out (undefined), cleared (null), or a day.
  arrivals: new Map<number, string | null | undefined>(),
}))

type MemberInput = { firstname: string; lastname: string; arrivedAt?: string | null }

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown, congregationId: number) => unknown) => fn({}, 1),
}))

vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn(async () => ({ flash: vi.fn() })),
  commitSession: vi.fn(async () => '__session=committed'),
}))

vi.mock('~/features/publishers/server/create-member.server', () => ({
  createMember: vi.fn((_db: unknown, _congregation: unknown, input: MemberInput) => {
    const id = members.size + 100
    members.set(id, { firstname: input.firstname, lastname: input.lastname })
    arrivals.set(id, input.arrivedAt)
    return Promise.resolve({ id, firstname: input.firstname })
  }),
}))

vi.mock('~/features/publishers/server/update-member.server', () => ({
  updateMember: vi.fn((_db: unknown, id: number, _c: number, _a: number, input: MemberInput) => {
    members.set(id, { firstname: input.firstname, lastname: input.lastname })
    arrivals.set(id, input.arrivedAt)
    return Promise.resolve({ id, firstname: input.firstname })
  }),
}))

const { Permission } = await import('~/shared/types/permission')
const { formRequest, respond, routeContext } = await import('~/tests/helpers/route-action')
const newPublisher = await import('./new-publisher')
const editPublisher = await import('./edit-publisher')

const PUBLISHER_FORM = { firstname: 'Mallory', lastname: 'Intruder', gender: 'male', phone: '', address: '' }

beforeEach(() => {
  members.clear()
  arrivals.clear()
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

// The arrival date drives the group page's welcome label: both forms must hand it to the service.
describe('arrival date', () => {
  it('reaches the new member', async () => {
    await respond(() =>
      newPublisher.action({
        request: formRequest('https://unitae.example.test/publishers/new', {
          ...PUBLISHER_FORM,
          arrivedAt: '2026-09-15',
        }),
        params: {},
        context: routeContext([Permission.CanManagePublishers]),
      } as never),
    )

    expect([...arrivals.values()]).toEqual(['2026-09-15'])
  })

  it.each([
    ['2026-09-15', '2026-09-15'],
    ['', null],
  ])('reaches the edited member: %j is stored as %j', async (arrivedAt, stored) => {
    await respond(() =>
      editPublisher.action({
        request: formRequest('https://unitae.example.test/publishers/42/edit', { ...PUBLISHER_FORM, arrivedAt }),
        params: { publisherId: '42' },
        context: routeContext([Permission.CanManagePublishers]),
      } as never),
    )

    expect(arrivals.get(42)).toBe(stored)
  })
})
