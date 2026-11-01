import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The last pastoral visit page: who may see the date and who may record it (publisher viewers and
// managers congregation-wide, the member's group overseer and assistant for their group), what a
// save or a clear writes, and where the page sends the caller back to.

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

type PageData = { visitedOn: string | null; canRecord: boolean; backTo: string }

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
  ) as Promise<PageData | Response>
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

describe('pastoral visit loader', () => {
  it('shows the date to a publisher viewer, read-only, and goes back to the publisher record', async () => {
    const result = (await open({}, [Permission.CanViewPublishers])) as PageData

    expect(result.visitedOn).toBe('2026-03-10')
    expect(result.canRecord).toBe(false)
    expect(result.backTo).toBe('/publishers/9/view')
  })

  it("lets the member's group overseer record it, and goes back to the group", async () => {
    const result = (await open({}, [], OVERSEER_OF_4)) as PageData

    expect(result.canRecord).toBe(true)
    expect(result.backTo).toBe('/groups/4/view')
  })

  it('refuses the overseer of another group', async () => {
    const result = (await open({}, [], OVERSEER_OF_5)) as Response

    expect(result.headers.get('Location')).toBe('/')
  })

  it('sends an unknown member home', async () => {
    const result = (await open({ publisherId: '10' }, [Permission.CanViewPublishers])) as Response

    expect(result.headers.get('Location')).toBe('/')
  })

  // An overseer who may also open publisher records came from his group page: he goes back to it.
  it('goes back to the group when opened from the group page', async () => {
    const result = (await open({ search: '?from=group' }, [Permission.CanViewPublishers], OVERSEER_OF_4)) as PageData

    expect(result.backTo).toBe('/groups/4/view')
  })
})

describe('pastoral visit action', () => {
  it('refuses a publisher viewer', async () => {
    const result = (await submit({}, { intent: 'save', visitedOn: '2026-10-20' }, [
      Permission.CanViewPublishers,
    ])) as Response

    expect(result.headers.get('Location')).toBe('/')
    expect(setLastPastoralVisit).not.toHaveBeenCalled()
  })

  it('refuses the overseer of another group', async () => {
    const result = (await submit({}, { intent: 'save', visitedOn: '2026-10-20' }, [], OVERSEER_OF_5)) as Response

    expect(result.headers.get('Location')).toBe('/')
    expect(setLastPastoralVisit).not.toHaveBeenCalled()
  })

  it('writes nothing for an unknown member', async () => {
    const result = (await submit({ publisherId: '10' }, { intent: 'save', visitedOn: '2026-10-20' }, [
      Permission.CanManagePublishers,
    ])) as Response

    expect(result.headers.get('Location')).toBe('/')
    expect(setLastPastoralVisit).not.toHaveBeenCalled()
  })

  it('goes back to the group page it was opened from', async () => {
    const result = (await submit(
      { search: '?from=group' },
      { intent: 'save', visitedOn: '2026-10-20' },
      [Permission.CanViewPublishers],
      OVERSEER_OF_4,
    )) as Response

    expect(result.headers.get('Location')).toBe('/groups/4/view')
  })

  it("records the overseer's visit and goes back to the group", async () => {
    const result = (await submit({}, { intent: 'save', visitedOn: '2026-10-20' }, [], OVERSEER_OF_4)) as Response

    expect(setLastPastoralVisit).toHaveBeenCalledWith({}, 9, 1, new Date('2026-10-20T00:00:00Z'), 7)
    expect(result.headers.get('Location')).toBe('/groups/4/view')
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

  it('refuses a visit in the future, on the date field', async () => {
    const result = (await submit({}, { intent: 'save', visitedOn: '2999-01-01' }, [], OVERSEER_OF_4)) as {
      data: { error: Record<string, string[]> }
      init: { status: number }
    }

    expect(result.init.status).toBe(400)
    expect(Object.keys(result.data.error)).toEqual(['visitedOn'])
    expect(setLastPastoralVisit).not.toHaveBeenCalled()
  })

  // 23:30 UTC on 19 October is already the 20th in Paris, the congregation's timezone.
  it("takes today on the congregation's calendar", async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-19T23:30:00Z') })

    await submit({}, { intent: 'save', visitedOn: '2026-10-20' }, [], OVERSEER_OF_4)
    const tomorrow = (await submit({}, { intent: 'save', visitedOn: '2026-10-21' }, [], OVERSEER_OF_4)) as {
      init: { status: number }
    }

    expect(setLastPastoralVisit).toHaveBeenCalledWith({}, 9, 1, new Date('2026-10-20T00:00:00Z'), 7)
    expect(setLastPastoralVisit).not.toHaveBeenCalledWith({}, 9, 1, new Date('2026-10-21T00:00:00Z'), 7)
    expect(tomorrow.init.status).toBe(400)
  })
})
