import { beforeEach, describe, expect, it, vi } from 'vitest'

// The matrix toggles a person into a team. A role belongs to the person, so the action gives it to
// the record (with its login, if any) — the form sends the member id and nothing else.
//
// Originally a regression test for a live 500: the form's member id reached a write that expected
// an account id. It survived because this feature had no route tests.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')

const addToRole = vi.fn()
const removeFromRole = vi.fn()
const holderOfMember = vi.fn()

const memberFindFirst = vi.fn()
const roleFindFirst = vi.fn()
const fakeDb = {
  member: { findFirst: memberFindFirst, findMany: vi.fn().mockResolvedValue([]) },
  // The action resolves the role before writing: it names the success flash, and its absence
  // refuses the toggle outright instead of letting the service no-op in silence.
  role: { findMany: vi.fn().mockResolvedValue([]), findFirst: roleFindFirst },
}

vi.mock('~/shared/domain/role-membership.server', () => ({ addToRole, removeFromRole }))
vi.mock('~/shared/domain/role-assignments.server', () => ({ holderOfMember }))

vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn(fakeDb),
}))

vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn().mockResolvedValue({ flash: vi.fn() }),
  commitSession: vi.fn().mockResolvedValue('cookie'),
}))

const { Permission } = await import('~/shared/types/permission')
const { action } = await import('./role-list')

function contextWith(permissions: (typeof Permission)[keyof typeof Permission][]) {
  return {
    get: (key: symbol) =>
      key === permissionsContext ? new Set(permissions) : { id: 1, congregationId: 10, firstname: 'A' },
  }
}

async function toggle(fields: Record<string, string>) {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.set(key, value)
  const request = new Request('http://localhost/congregation/roles', { method: 'POST', body })
  return action({ request, context: contextWith([Permission.CanManageRoles]), params: {} } as never)
}

// clearAllMocks, not resetAllMocks: the db stubs above carry default implementations that the
// tests rely on, and resetting would strip them.
beforeEach(() => {
  vi.clearAllMocks()
  roleFindFirst.mockResolvedValue({ key: 'compte', name: 'Compte' })
})

describe('role matrix toggle', () => {
  it('gives the role to the person, with their login', async () => {
    memberFindFirst.mockResolvedValue({ firstname: 'Anna', lastname: 'Test' })
    holderOfMember.mockResolvedValue({ memberId: 500, userId: 800 })

    await toggle({ memberId: '500', roleId: '7', intent: 'add' })

    expect(holderOfMember).toHaveBeenCalledWith(expect.anything(), 500, 10)
    expect(addToRole).toHaveBeenCalledWith(
      expect.anything(),
      { memberId: 500, userId: 800 },
      7,
      10,
      1,
      new Set([Permission.CanManageRoles]),
    )
  })

  it('gives the role to a publisher without a login', async () => {
    memberFindFirst.mockResolvedValue({ firstname: 'Bruno', lastname: 'Test' })
    holderOfMember.mockResolvedValue({ memberId: 501, userId: null })

    await toggle({ memberId: '501', roleId: '7', intent: 'add' })

    expect(addToRole).toHaveBeenCalledWith(
      expect.anything(),
      { memberId: 501, userId: null },
      7,
      10,
      1,
      new Set([Permission.CanManageRoles]),
    )
  })

  it('takes the role off the person too', async () => {
    memberFindFirst.mockResolvedValue({ firstname: 'Anna', lastname: 'Test' })
    holderOfMember.mockResolvedValue({ memberId: 500, userId: 800 })

    await toggle({ memberId: '500', roleId: '7', intent: 'remove' })

    expect(removeFromRole).toHaveBeenCalledWith(
      expect.anything(),
      { memberId: 500, userId: 800 },
      7,
      10,
      1,
      new Set([Permission.CanManageRoles]),
    )
  })

  it('refuses a person of another congregation', async () => {
    memberFindFirst.mockResolvedValue(null)

    await toggle({ memberId: '500', roleId: '7', intent: 'add' })

    expect(addToRole).not.toHaveBeenCalled()
  })

  it('refuses a role that no longer exists instead of letting the service no-op in silence', async () => {
    // A stale tab: the role was deleted after the matrix rendered. The service would return
    // without writing and the page would reload saying nothing — the click that "did nothing".
    memberFindFirst.mockResolvedValue({ firstname: 'Anna', lastname: 'Test' })
    holderOfMember.mockResolvedValue({ memberId: 500, userId: 800 })
    roleFindFirst.mockResolvedValue(null)

    await toggle({ memberId: '500', roleId: '7', intent: 'add' })

    expect(addToRole).not.toHaveBeenCalled()
  })
})
