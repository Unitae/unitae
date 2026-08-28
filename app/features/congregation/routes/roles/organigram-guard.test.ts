import { describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

// The organigram is readable by anyone who may see roles, and editable only by someone who may
// manage them. Both guards are one `if` in a loader or action, which is exactly the kind of line
// that gets refactored away without anyone noticing.
//
// Follows app/features/events/routes/programs/days-off-guard.test.ts: drive the real loader and
// action with a fake context and assert on the redirect.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')

// Any model, any method, empty result — these tests are about the guards, not the queries.
const fakeDb = new Proxy(
  {},
  {
    get: () => new Proxy({}, { get: (_t, method) => vi.fn().mockResolvedValue(method === 'count' ? 0 : []) }),
  },
)

vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  requirePermission: vi.fn(),
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn(fakeDb),
}))

vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn().mockResolvedValue({ flash: vi.fn() }),
  commitSession: vi.fn().mockResolvedValue('cookie'),
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

function contextWith(permissions: Permission[]) {
  return {
    get: (key: symbol) =>
      key === permissionsContext ? new Set(permissions) : { id: 1, congregationId: 1, firstname: 'A' },
  }
}

// Imported at module scope: a dynamic import inside a test body puts the route's transform cost
// inside the measured window, which is what makes a 5s timeout flaky under a full parallel run.
const { loader, action } = await import('./organigram')

const request = new Request('http://localhost/congregation/roles/organigram')

async function loadWith(permissions: Permission[]) {
  return await loader({ request, context: contextWith(permissions), params: {} } as never)
}

async function actWith(permissions: Permission[]) {
  const body = new FormData()
  body.set('intent', 'remove')
  body.set('roleId', '1')
  const post = new Request('http://localhost/congregation/roles/organigram', { method: 'POST', body })
  return await action({ request: post, context: contextWith(permissions), params: {} } as never)
}

describe('organigram loader — who may read the chart', () => {
  it('turns away a caller holding neither role permission', async () => {
    const response = await loadWith([Permission.CanViewBoard]).catch(error => error)

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(302)
    expect((response as Response).headers.get('Location')).toBe('/')
  })

  it('admits a caller who may view roles', async () => {
    const result = await loadWith([Permission.CanViewRoles])
    expect(result).not.toBeInstanceOf(Response)
  })

  it('admits a caller who may manage roles', async () => {
    const result = await loadWith([Permission.CanManageRoles])
    expect(result).not.toBeInstanceOf(Response)
  })

  it('offers no editing data to a read-only caller', async () => {
    // The panel's pickers are the whole edit surface: a viewer must not receive the member list
    // or the adoptable roles even though the route renders for them.
    const result = (await loadWith([Permission.CanViewRoles])) as { canManageRoles: boolean; people: unknown[] }

    expect(result.canManageRoles).toBe(false)
    expect(result.people).toEqual([])
  })
})

describe('organigram action — who may change the chart', () => {
  it('turns away a caller who may only view roles', async () => {
    const response = await actWith([Permission.CanViewRoles]).catch(error => error)

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(302)
    expect((response as Response).headers.get('Location')).toBe('/congregation/roles/organigram')
  })

  it('turns away a caller holding no role permission at all', async () => {
    const response = await actWith([]).catch(error => error)

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(302)
  })
})
