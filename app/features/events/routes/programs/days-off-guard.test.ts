import { describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

// /programs/days-off shows when *other people* are unavailable. Seeing that is its own
// capability: a congregation may want someone to read the schedule without reading who
// is away. It used to admit anyone holding can-view-programs, so the absence permission
// could never actually restrict anything.
//
// Personal days-off (/me/days-off) is unaffected — it is scoped to the signed-in account
// and stays ungated.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')

// Any model, any method, empty result — this test is about the guard, not the query.
const fakeDb = new Proxy(
  {},
  {
    get: () => new Proxy({}, { get: (_t, method) => vi.fn().mockResolvedValue(method === 'count' ? 0 : []) }),
  },
)

vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn(fakeDb),
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

function contextWith(permissions: Permission[]) {
  return {
    get: (key: symbol) =>
      key === permissionsContext ? new Set(permissions) : { id: 1, congregationId: 1, firstname: 'A' },
  }
}

const request = new Request('http://localhost/programs/days-off')

// Imported once at module scope. A dynamic import inside the test body puts the route's
// transform cost inside the measured window, which is what makes a 5s timeout flaky
// under a full parallel run.
const { loader } = await import('./days-off')

// Kept async: `loader` is a sync function whose guard throws, so without this the
// redirect escapes as a synchronous throw and never reaches `.catch()`.
async function loadWith(permissions: Permission[]) {
  return await loader({ request, context: contextWith(permissions), params: {} } as never)
}

describe('/programs/days-off — who may see other people’s absences', () => {
  it('turns away a caller holding only can-view-programs', async () => {
    // The behaviour change: reading the schedule no longer implies reading absences.
    const response = await loadWith([Permission.CanViewPrograms]).catch(error => error)

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(302)
    expect((response as Response).headers.get('Location')).toBe('/')
  })

  it('admits a caller holding can-view-absences', async () => {
    const result = await loadWith([Permission.CanViewAbsences, Permission.CanViewPrograms])

    expect(result).not.toBeInstanceOf(Response)
  })

  it('turns away a caller holding neither', async () => {
    const response = await loadWith([]).catch(error => error)

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(302)
  })
})
