import { beforeEach, describe, expect, it, vi } from 'vitest'

// The matrix toggles a member into an eligibility group. Assignments are account-bound, so the
// action has to translate the member into their account — the form cannot know the account id and
// should not have to.
//
// This is a regression test for a live 500: the form submitted `member.id` into a field named
// `userId`, which reached `addUserToRole` and landed in `userRoleAssignment.create` where it must
// be a `UserAccount` id. Member ids and account ids are different sequences, so it failed on the
// foreign key. It survived because this feature had no route tests.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')

const addUserToRole = vi.fn()
const removeUserFromRole = vi.fn()

const memberFindFirst = vi.fn()
const roleFindFirst = vi.fn()
const fakeDb = {
  member: { findFirst: memberFindFirst, findMany: vi.fn().mockResolvedValue([]) },
  // The action resolves the role before writing: it names the success flash, and its absence
  // refuses the toggle outright instead of letting the service no-op in silence.
  role: { findMany: vi.fn().mockResolvedValue([]), findFirst: roleFindFirst },
}

vi.mock('~/shared/domain/roles.server', () => ({ addUserToRole, removeUserFromRole }))

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
  it('assigns against the member’s account, not the member id', async () => {
    memberFindFirst.mockResolvedValue({ id: 500, account: { id: 800 } })

    await toggle({ memberId: '500', roleId: '7', intent: 'add' })

    expect(addUserToRole).toHaveBeenCalledWith(expect.anything(), 800, 7, 10, 1)
  })

  it('removes against the member’s account too', async () => {
    memberFindFirst.mockResolvedValue({ id: 500, account: { id: 800 } })

    await toggle({ memberId: '500', roleId: '7', intent: 'remove' })

    expect(removeUserFromRole).toHaveBeenCalledWith(expect.anything(), 800, 7, 10, 1)
  })

  it('refuses a member with no login instead of failing on a foreign key', async () => {
    memberFindFirst.mockResolvedValue({ id: 500, account: null })

    await toggle({ memberId: '500', roleId: '7', intent: 'add' })

    expect(addUserToRole).not.toHaveBeenCalled()
  })

  it('refuses a role that no longer exists instead of letting the service no-op in silence', async () => {
    // A stale tab: the role was deleted after the matrix rendered. The service would return
    // without writing and the page would reload saying nothing — the click that "did nothing".
    memberFindFirst.mockResolvedValue({ id: 500, account: { id: 800 } })
    roleFindFirst.mockResolvedValue(null)

    await toggle({ memberId: '500', roleId: '7', intent: 'add' })

    expect(addUserToRole).not.toHaveBeenCalled()
  })
})
