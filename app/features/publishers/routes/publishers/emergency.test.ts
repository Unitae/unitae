import { beforeEach, describe, expect, it, vi } from 'vitest'

// A member's emergency information page: who may open it and who may save it (emergency permission
// holders congregation-wide, the member's group overseer and assistant for their group), and where
// it sends the caller back to, including after a save.

const { flash, updateEmergencyInfo } = vi.hoisted(() => ({ flash: vi.fn(), updateEmergencyInfo: vi.fn() }))

vi.mock('~/shared/auth/route-context.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/auth/route-context.server')>()),
  withScopeFromContext: (_context: unknown, fn: (db: unknown, congregationId: number) => unknown) => fn({}, 1),
}))
vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn(async () => ({ flash })),
  commitSession: vi.fn(async () => '__session=committed'),
}))
vi.mock('~/features/publishers/server/emergency-info.aggregate', () => ({ updateEmergencyInfo }))
vi.mock('~/features/publishers/server/emergency.queries', () => ({
  getEmergencyInfoForMember: vi.fn(async () => ({
    id: 9,
    firstname: 'Ana',
    lastname: 'Lima',
    publisherGroupId: 4,
    dpaCardUpToDate: false,
    survivalBackpackReady: false,
    emergencyContacts: [],
  })),
}))

const { Permission } = await import('~/shared/types/permission')
const { formRequest, routeContext } = await import('~/tests/helpers/route-action')
const page = await import('./emergency')

const OVERSEER_OF_4 = { member: { id: 10, responsibleFor: { id: 4 } } }
const OVERSEER_OF_5 = { member: { id: 11, responsibleFor: { id: 5 } } }
const RECORD_VIEWER = [Permission.CanViewEmergencyInfo, Permission.CanViewPublishers]
const FROM_GROUP = '?from=group'

// A loader resolves to its data, an action may answer with data(); both redirect by throwing.
async function respondOrData(run: () => unknown): Promise<unknown> {
  try {
    return await run()
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    throw thrown
  }
}

type PageData = { canManage: boolean; backTo: string }

function open(search: string, ...args: Parameters<typeof routeContext>) {
  return respondOrData(() =>
    page.loader({
      request: new Request(`https://unitae.example.test/publishers/9/emergency${search}`),
      params: { publisherId: '9' },
      context: routeContext(...args),
    } as never),
  ) as Promise<PageData | Response>
}

function save(search: string, ...args: Parameters<typeof routeContext>) {
  return respondOrData(() =>
    page.action({
      request: formRequest(`https://unitae.example.test/publishers/9/emergency${search}`, { dpaCardUpToDate: 'on' }),
      params: { publisherId: '9' },
      context: routeContext(...args),
    } as never),
  ) as Promise<Response>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('emergency page loader', () => {
  it('goes back to the record for a viewer who may open it, unless the group page opened it', async () => {
    const fromRecord = (await open('', RECORD_VIEWER)) as PageData
    const fromGroup = (await open(FROM_GROUP, RECORD_VIEWER)) as PageData

    expect(fromRecord.backTo).toBe('/publishers/9/view')
    expect(fromGroup.backTo).toBe('/groups/4/view')
  })

  it("lets the member's group overseer manage it, and goes back to the group, not a record he cannot open", async () => {
    const result = (await open('', [], OVERSEER_OF_4)) as PageData

    expect(result.canManage).toBe(true)
    expect(result.backTo).toBe('/groups/4/view')
  })

  it('refuses the overseer of another group', async () => {
    const result = (await open('', [], OVERSEER_OF_5)) as Response

    expect(result.headers.get('Location')).toBe('/')
  })
})

describe('emergency page action', () => {
  it('stays on the page after a save, keeping the way back to the group page', async () => {
    const result = await save(FROM_GROUP, [], OVERSEER_OF_4)

    expect(result.headers.get('Location')).toBe('/publishers/9/emergency?from=group')
    expect(updateEmergencyInfo).toHaveBeenCalledOnce()
  })

  it('adds no query when the page was opened without one', async () => {
    const result = await save('', [Permission.CanManageEmergencyInfo])

    expect(result.headers.get('Location')).toBe('/publishers/9/emergency')
  })

  it('refuses the overseer of another group, without writing', async () => {
    const result = await save('', [], OVERSEER_OF_5)

    expect(result.headers.get('Location')).toBe('/')
    expect(updateEmergencyInfo).not.toHaveBeenCalled()
  })

  it('refuses a holder of the view permission only, without writing', async () => {
    const result = await save('', [Permission.CanViewEmergencyInfo])

    expect(result.headers.get('Location')).toBe('/')
    expect(updateEmergencyInfo).not.toHaveBeenCalled()
  })
})
