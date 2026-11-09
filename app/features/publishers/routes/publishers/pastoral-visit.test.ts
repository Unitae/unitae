import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The pastoral visit route: the visit dialog posts here (who may record a visit — publisher managers congregation-wide,
// the member's group overseer and assistant for their group — and what a save or a clear writes), and an old link to the
// page opens that dialog where it lives, on the record or the group page.

const { flash, setLastPastoralVisit } = vi.hoisted(() => ({ flash: vi.fn(), setLastPastoralVisit: vi.fn() }))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown, congregationId: number) => unknown) => fn({}, 1),
}))
vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn(async () => ({ flash })),
  commitSession: vi.fn(async () => '__session=committed'),
}))
vi.mock('~/features/publishers/index.server', () => ({ memberAggregate: { setLastPastoralVisit } }))
vi.mock('~/features/publishers/server/pastoral-visit.queries', () => ({
  getPastoralVisitForMember: vi.fn(async (_db: unknown, memberId: number) =>
    memberId === 9
      ? {
          id: 9,
          firstname: 'Ana',
          lastname: 'Lima',
          publisherGroupId: 4,
          lastPastoralVisitAt: new Date('2026-03-10T00:00:00Z'),
        }
      : null,
  ),
}))

const { Permission } = await import('~/shared/types/permission')
const { formRequest, routeContext } = await import('~/tests/helpers/route-action')
const page = await import('./pastoral-visit')

const OVERSEER_OF_4 = { member: { id: 10, responsibleFor: { id: 4 } } }
const OVERSEER_OF_5 = { member: { id: 11, responsibleFor: { id: 5 } } }

// A loader resolves to its data, an action may answer with data(); both redirect by throwing.
async function respondOrData(run: () => unknown): Promise<unknown> {
  try {
    return await run()
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    throw thrown
  }
}

// Member 9 exists; any other id is not found. `from=group` is what the group page's visit icon adds.
type Target = { publisherId?: string; search?: string }

function open(target: Target, ...args: Parameters<typeof routeContext>) {
  const { publisherId = '9', search = '' } = target
  return respondOrData(() =>
    page.loader({
      request: new Request(`https://unitae.example.test/publishers/${publisherId}/pastoral-visit${search}`),
      params: { publisherId },
      context: routeContext(...args),
    } as never),
  ) as Promise<Response>
}

function submit(target: Target, fields: Record<string, string>, ...args: Parameters<typeof routeContext>) {
  const { publisherId = '9', search = '' } = target
  return respondOrData(() =>
    page.action({
      request: formRequest(`https://unitae.example.test/publishers/${publisherId}/pastoral-visit${search}`, fields),
      params: { publisherId },
      context: routeContext(...args),
    } as never),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

type Answer = { data: { ok?: boolean; error?: Record<string, string[]> }; init: { status: number } | null } | Response
const status = (answer: Answer) => (answer instanceof Response ? answer.status : (answer.init?.status ?? 200))

describe('old pastoral visit page', () => {
  it('opens the dialog on the record for a reader of records', async () => {
    const result = await open({}, [Permission.CanViewPublishers])
    expect(result.headers.get('Location')).toBe('/publishers/9/view?panel=visit')
  })

  it('opens it on the group page for an overseer, or when the group page linked there', async () => {
    expect((await open({}, [], OVERSEER_OF_4)).headers.get('Location')).toBe('/groups/4/view?visit=9')
    const fromGroup = await open({ search: '?from=group' }, [Permission.CanViewPublishers], OVERSEER_OF_4)
    expect(fromGroup.headers.get('Location')).toBe('/groups/4/view?visit=9')
  })

  it('sends an unknown member home', async () => {
    expect((await open({ publisherId: '10' }, [Permission.CanViewPublishers])).headers.get('Location')).toBe('/')
  })
})

describe('noting a pastoral visit', () => {
  it('refuses a publisher viewer, the overseer of another group and an unknown member, without writing', async () => {
    const visit = { intent: 'save', visitedOn: '2026-10-20' }
    const refused = [
      await submit({}, visit, [Permission.CanViewPublishers]),
      await submit({}, visit, [], OVERSEER_OF_5),
      await submit({ publisherId: '10' }, visit, [Permission.CanManagePublishers]),
    ] as Answer[]
    expect(refused.map(status)).toEqual([403, 403, 403])
    expect(setLastPastoralVisit).not.toHaveBeenCalled()
  })

  it("records the overseer's visit, and answers the dialog so it closes", async () => {
    const result = (await submit({}, { intent: 'save', visitedOn: '2026-10-20' }, [], OVERSEER_OF_4)) as Answer

    expect(setLastPastoralVisit).toHaveBeenCalledWith({}, 9, 1, new Date('2026-10-20T00:00:00Z'), 7)
    expect(result).toMatchObject({ data: { ok: true } })
    expect(flash).toHaveBeenCalledWith('success', expect.any(String))
  })

  it('records a publisher manager’s visit', async () => {
    await submit({}, { intent: 'save', visitedOn: '2026-10-20' }, [Permission.CanManagePublishers])

    expect(setLastPastoralVisit).toHaveBeenCalledWith({}, 9, 1, new Date('2026-10-20T00:00:00Z'), 7)
  })

  it('clears the date', async () => {
    await submit({}, { intent: 'clear' }, [], OVERSEER_OF_4)

    expect(setLastPastoralVisit).toHaveBeenCalledWith({}, 9, 1, null, 7)
  })

  it('refuses a visit in the future, and says why', async () => {
    const result = (await submit({}, { intent: 'save', visitedOn: '2999-01-01' }, [], OVERSEER_OF_4)) as Answer

    expect(status(result)).toBe(400)
    expect(result).toMatchObject({ data: { error: { '': [expect.stringContaining('futur')] } } })
    expect(setLastPastoralVisit).not.toHaveBeenCalled()
  })

  // 23:30 UTC on 19 October is already the 20th in Paris, the congregation's timezone.
  it("takes today on the congregation's calendar", async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-19T23:30:00Z') })

    await submit({}, { intent: 'save', visitedOn: '2026-10-20' }, [], OVERSEER_OF_4)
    const tomorrow = (await submit({}, { intent: 'save', visitedOn: '2026-10-21' }, [], OVERSEER_OF_4)) as Answer

    expect(setLastPastoralVisit).toHaveBeenCalledWith({}, 9, 1, new Date('2026-10-20T00:00:00Z'), 7)
    expect(setLastPastoralVisit).not.toHaveBeenCalledWith({}, 9, 1, new Date('2026-10-21T00:00:00Z'), 7)
    expect(status(tomorrow)).toBe(400)
  })
})
