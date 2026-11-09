import { beforeEach, describe, expect, it, vi } from 'vitest'

// The departure, dated by the record's dialog. The day it sends is stored from its start in the congregation's zone;
// a day still to come is refused before anything changes.

const { calls, flashes } = vi.hoisted(() => ({
  calls: [] as { state: string; at: Date | undefined }[],
  flashes: [] as [string, string][],
}))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown, congregationId: number) => unknown) =>
    fn({ member: { findFirst: () => ({ firstname: 'Nathan', lastname: 'GIRARD' }) } }, 1),
}))
vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn(() => ({ flash: (kind: string, message: string) => flashes.push([kind, message]) })),
  commitSession: vi.fn(() => '__session=committed'),
}))
vi.mock('~/features/publishers/index.server', () => ({
  memberAggregate: {
    setLifecycle: vi.fn((_db, _id, _c, _a, state: string, _trigger: unknown, at: Date | undefined) => {
      calls.push({ state, at })
    }),
  },
}))

const { formRequest, respond, routeContext } = await import('~/tests/helpers/route-action')
const { Permission } = await import('~/shared/types/permission')
const route = await import('./mark-as-left')

function leave(fields: Record<string, string>) {
  return respond(() =>
    route.action({
      request: formRequest('https://unitae.example.test/publishers/12/mark-as-left', fields),
      params: { publisherId: '12' },
      context: routeContext([Permission.CanManagePublisherLifecycle]),
    } as never),
  )
}

beforeEach(() => {
  calls.length = 0
  flashes.length = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2027-03-16T10:00:00Z'))
})

describe('marking a publisher as left', () => {
  it('dates the departure from the start of the chosen day, in the congregation’s zone', async () => {
    await leave({ leftOn: '2027-03-01' })
    expect(calls).toEqual([{ state: 'left', at: new Date('2027-02-28T23:00:00Z') }])
    expect(flashes[0]?.[0]).toBe('success')
  })

  it('takes today when the form sends no day', async () => {
    await leave({})
    expect(calls).toEqual([{ state: 'left', at: undefined }])
  })

  it('refuses a day still to come, and changes nothing', async () => {
    await leave({ leftOn: '2027-03-17' })
    expect(calls).toEqual([])
    expect(flashes).toEqual([['error', expect.stringContaining('futur')]])
  })
})
