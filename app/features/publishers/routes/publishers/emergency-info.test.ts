import { beforeEach, describe, expect, it, vi } from 'vitest'

// The emergency panel's data route: who may read a member's emergency information and who may save it (emergency
// permission holders congregation-wide, the member's group overseer and assistant for their group). A refusal answers
// with data, so the panel stays where it was opened.

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
const route = await import('./emergency-info')

const OVERSEER_OF_4 = { member: { id: 10, responsibleFor: { id: 4 } } }
const OVERSEER_OF_5 = { member: { id: 11, responsibleFor: { id: 5 } } }
const VIEWER = [Permission.CanViewEmergencyInfo]

/** A route result as status and body: `data()` wraps both, a plain object is a 200. */
async function settle(run: () => unknown) {
  const result = (await run()) as { type?: string; data?: unknown; init?: { status?: number } | null }
  if (result?.type === 'DataWithResponseInit') {
    return { status: result.init?.status ?? 200, body: result.data as Record<string, unknown> }
  }
  return { status: 200, body: result as Record<string, unknown> }
}

function open(...args: Parameters<typeof routeContext>) {
  return settle(() =>
    route.loader({
      request: new Request('https://unitae.example.test/publishers/9/emergency-info'),
      params: { publisherId: '9' },
      context: routeContext(...args),
    } as never),
  )
}

function save(...args: Parameters<typeof routeContext>) {
  return settle(() =>
    route.action({
      request: formRequest('https://unitae.example.test/publishers/9/emergency-info', { dpaCardUpToDate: 'on' }),
      params: { publisherId: '9' },
      context: routeContext(...args),
    } as never),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('emergency panel route', () => {
  it('lets a holder of the view permission read it, without changing it', async () => {
    const read = await open(VIEWER)
    expect(read.body).toMatchObject({ ok: true, name: 'Ana LIMA', canManage: false })
  })

  it("lets the member's group overseer read and change it", async () => {
    expect((await open([], OVERSEER_OF_4)).body).toMatchObject({ ok: true, canManage: true })
    const saved = await save([], OVERSEER_OF_4)
    expect(saved.body).toEqual({ ok: true })
    expect(updateEmergencyInfo).toHaveBeenCalledOnce()
  })

  it('refuses the overseer of another group, to read and to save, without writing', async () => {
    expect(await open([], OVERSEER_OF_5)).toEqual({ status: 403, body: { ok: false, reason: 'forbidden' } })
    expect((await save([], OVERSEER_OF_5)).status).toBe(403)
    expect(updateEmergencyInfo).not.toHaveBeenCalled()
  })

  it('refuses a holder of the view permission only a save, without writing', async () => {
    expect((await save(VIEWER)).status).toBe(403)
    expect(updateEmergencyInfo).not.toHaveBeenCalled()
  })
})
