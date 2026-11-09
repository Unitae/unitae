import { beforeEach, describe, expect, it, vi } from 'vitest'

// The old emergency page: it opens the emergency panel where the reader would have come from, the member's record or
// their group's page.

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
const { respond, routeContext } = await import('~/tests/helpers/route-action')
const page = await import('./emergency')

const OVERSEER_OF_4 = { member: { id: 10, responsibleFor: { id: 4 } } }
const RECORD_VIEWER = [Permission.CanViewEmergencyInfo, Permission.CanViewPublishers]

async function open(search: string, ...args: Parameters<typeof routeContext>) {
  const response = await respond(() =>
    page.loader({
      request: new Request(`https://unitae.example.test/publishers/9/emergency${search}`),
      params: { publisherId: '9' },
      context: routeContext(...args),
    } as never),
  )
  return response.headers.get('Location')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('old emergency page', () => {
  it('opens the panel on the record for a reader of records', async () => {
    expect(await open('', RECORD_VIEWER)).toBe('/publishers/9/view?panel=emergency')
  })

  it('opens it on the group page when the group page linked there, or for an overseer without records', async () => {
    expect(await open('?from=group', RECORD_VIEWER)).toBe('/groups/4/view?emergency=9')
    expect(await open('', [], OVERSEER_OF_4)).toBe('/groups/4/view?emergency=9')
  })
})
