import { beforeEach, describe, expect, it, vi } from 'vitest'

// Giving and taking roles by hand, against an in-memory congregation: the tests read the two assignment tables back.

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { UserRoleAssignmentChanged: 'UserRoleAssignmentChanged' },
  audit: vi.fn(),
}))

const { lastAdminChecks } = vi.hoisted(() => ({ lastAdminChecks: [] as number[] }))
vi.mock('~/shared/auth/permissions.server', () => ({
  isAccountAdmin: vi.fn(async () => false),
  requireNotLastAdmin: vi.fn(async (accountId: number) => {
    lastAdminChecks.push(accountId)
  }),
}))

interface Row {
  roleId: number
  congregationId: number
  kind: string
  memberId?: number
  userId?: number
}

const CONGREGATION = 10
const ROLES = [
  { id: 1, key: 'elder', isBuiltIn: true, isSinglePerson: false },
  { id: 2, key: 'admin', isBuiltIn: true, isSinglePerson: false },
  { id: 3, key: 'sono', isBuiltIn: false, isSinglePerson: false },
  { id: 4, key: 'lecteurs', isBuiltIn: false, isSinglePerson: false },
  { id: 5, key: 'comptes', isBuiltIn: false, isSinglePerson: true },
]

let records: Row[]
let logins: Row[]

/** The where clause of a role filter, as `handGivenRole()` writes it: not personal, custom or a system key. */
function roleMatches(roleId: number, filter: unknown): boolean {
  if (filter == null) return true
  const role = ROLES.find(r => r.id === roleId)
  const f = filter as { isSinglePerson: boolean; OR: [{ isBuiltIn: boolean }, { key: { in: string[] } }] }
  return !!role && role.isSinglePerson === f.isSinglePerson && (!role.isBuiltIn || f.OR[1].key.in.includes(role.key))
}

function table(rows: () => Row[]) {
  const pick = (where: Record<string, unknown>) =>
    rows().filter(row =>
      Object.entries(where).every(([key, value]) =>
        key === 'role' ? roleMatches(row.roleId, value) : row[key as keyof Row] === value,
      ),
    )
  return {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => pick(where)[0] ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) => pick(where),
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: Record<string, Record<string, unknown>>
      create: Row
      update: Partial<Row>
    }) => {
      const found = pick(Object.values(where)[0] ?? {})[0]
      if (found) Object.assign(found, update)
      else rows().push({ ...create })
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const doomed = new Set(pick(where))
      const kept = rows().filter(row => !doomed.has(row))
      rows().splice(0, rows().length, ...kept)
    },
  }
}

const db = {
  role: {
    findFirst: async ({ where }: { where: { id: number } }) => ROLES.find(r => r.id === where.id) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) => ROLES.filter(r => roleMatches(r.id, where)),
  },
  rolePermission: {
    findMany: async () => [],
    findFirst: async ({ where }: { where: { roleId: { in: number[] } } }) =>
      where.roleId.in.includes(2) ? { roleId: 2 } : null,
  },
  memberRoleAssignment: table(() => records),
  userRoleAssignment: table(() => logins),
} as never

const ADMIN_ACTOR = new Set(['can-do-anything'])
const ACTOR = 99
const WITH_LOGIN = { memberId: 500, userId: 800 }
const WITHOUT_LOGIN = { memberId: 501, userId: null }
const LOGIN_ONLY = { memberId: null, userId: 801 }

const { addToRole, assertMayOpenAccessForRecord, removeFromRole, setGivenRoles } = await import(
  './role-membership.server'
)
const { GrantBeyondActorError } = await import('~/shared/domain/role-grant-limits.server')
const { audit } = await import('~/shared/domain/audit.server')
const { ForbiddenError, ValidationError } = await import('~/shared/errors/app-error.server')

beforeEach(() => {
  vi.clearAllMocks()
  records = []
  logins = []
  lastAdminChecks.length = 0
})

describe('addToRole', () => {
  it('puts a publisher without an account in a team', async () => {
    await addToRole(db, WITHOUT_LOGIN, 3, CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(records).toEqual([{ memberId: 501, roleId: 3, congregationId: CONGREGATION, kind: 'member' }])
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'Member', entityId: 501, metadata: { added: ['sono'], removed: [] } }),
    )
  })

  it('puts a publisher with an account in a team on their record', async () => {
    await addToRole(db, WITH_LOGIN, 3, CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(records).toHaveLength(1)
    expect(logins).toEqual([])
  })

  it('keeps a team given to an account without a record on the account', async () => {
    await addToRole(db, LOGIN_ONLY, 3, CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(logins).toEqual([{ userId: 801, roleId: 3, congregationId: CONGREGATION, kind: 'member' }])
  })

  it('refuses admin to someone without a login', async () => {
    await expect(addToRole(db, WITHOUT_LOGIN, 2, CONGREGATION, ACTOR, ADMIN_ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('refuses identity roles and personal roles', async () => {
    await expect(addToRole(db, WITH_LOGIN, 1, CONGREGATION, ACTOR, ADMIN_ACTOR)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(addToRole(db, WITH_LOGIN, 5, CONGREGATION, ACTOR, ADMIN_ACTOR)).rejects.toBeInstanceOf(ForbiddenError)
    expect(records).toEqual([])
  })

  it('does nothing for someone already in the team, wherever it is kept', async () => {
    logins.push({ userId: 800, roleId: 3, congregationId: CONGREGATION, kind: 'member' })
    await addToRole(db, WITH_LOGIN, 3, CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(records).toEqual([])
    expect(vi.mocked(audit)).not.toHaveBeenCalled()
  })
})

describe('removeFromRole', () => {
  it('takes a publisher without an account out of a team', async () => {
    records.push({ memberId: 501, roleId: 3, congregationId: CONGREGATION, kind: 'member' })
    await removeFromRole(db, WITHOUT_LOGIN, 3, CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(records).toEqual([])
  })

  it('takes the role off the login too, where older code left it', async () => {
    logins.push({ userId: 800, roleId: 3, congregationId: CONGREGATION, kind: 'member' })
    await removeFromRole(db, WITH_LOGIN, 3, CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(logins).toEqual([])
  })

  it.each(['leader', 'deputy'])('refuses to take a %s seat — it changes hands on the organigram', async kind => {
    records.push({ memberId: 500, roleId: 3, congregationId: CONGREGATION, kind })
    await expect(removeFromRole(db, WITH_LOGIN, 3, CONGREGATION, ACTOR, ADMIN_ACTOR)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(records).toHaveLength(1)
  })

  it('refuses taking your own roles away', async () => {
    records.push({ memberId: 500, roleId: 3, congregationId: CONGREGATION, kind: 'member' })
    await expect(removeFromRole(db, WITH_LOGIN, 3, CONGREGATION, 800, ADMIN_ACTOR)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('does nothing when the holder is not in the team', async () => {
    await removeFromRole(db, WITH_LOGIN, 3, CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(vi.mocked(audit)).not.toHaveBeenCalled()
  })
})

describe('setGivenRoles', () => {
  it('sets a person’s teams on their record, admin on their login', async () => {
    await setGivenRoles(db, WITH_LOGIN, [3, 2], CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(records).toEqual([{ memberId: 500, roleId: 3, congregationId: CONGREGATION, kind: 'member' }])
    expect(logins).toEqual([{ userId: 800, roleId: 2, congregationId: CONGREGATION, kind: 'member' }])
  })

  it('removes what is no longer ticked and keeps what still is, seat included', async () => {
    records.push({ memberId: 500, roleId: 3, congregationId: CONGREGATION, kind: 'leader' })
    records.push({ memberId: 500, roleId: 4, congregationId: CONGREGATION, kind: 'member' })
    await setGivenRoles(db, WITH_LOGIN, [3], CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(records).toEqual([{ memberId: 500, roleId: 3, congregationId: CONGREGATION, kind: 'leader' }])
  })

  it('ignores identity and personal roles on both sides', async () => {
    records.push({ memberId: 500, roleId: 1, congregationId: CONGREGATION, kind: 'member' })
    records.push({ memberId: 500, roleId: 5, congregationId: CONGREGATION, kind: 'leader' })
    await setGivenRoles(db, WITH_LOGIN, [1, 5, 999], CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(records).toHaveLength(2)
    expect(vi.mocked(audit)).not.toHaveBeenCalled()
  })

  it('checks the last administrator when a role that grants admin is removed', async () => {
    logins.push({ userId: 800, roleId: 2, congregationId: CONGREGATION, kind: 'member' })
    await setGivenRoles(db, WITH_LOGIN, [], CONGREGATION, ACTOR, ADMIN_ACTOR)
    expect(lastAdminChecks).toEqual([800])
  })
})

describe('assertMayOpenAccessForRecord', () => {
  // A record's given roles carry their permissions to the login created for it. Creating that login hands those
  // permissions out, so the actor must hold them — the same limit as giving the roles directly.
  const permissionsOf: Record<number, string[]> = {
    3: ['can-view-programs'],
    4: ['can-do-anything'],
    1: ['can-view-board'],
  }
  const recordDb = (roleIds: number[]) =>
    ({
      memberRoleAssignment: {
        findMany: async () => roleIds.map(id => ({ role: { id, key: ROLES.find(r => r.id === id)?.key ?? 'x' } })),
      },
      rolePermission: {
        findMany: async ({ where }: { where: { roleId: { in: number[] } } }) =>
          where.roleId.in.flatMap(id => (permissionsOf[id] ?? []).map(key => ({ permission: { key } }))),
      },
    }) as never

  it('lets an actor who holds the roles’ permissions open the access', async () => {
    await expect(
      assertMayOpenAccessForRecord(recordDb([3]), 501, CONGREGATION, new Set(['can-view-programs'])),
    ).resolves.toBeUndefined()
  })

  it('refuses an actor who lacks a permission one of the roles carries', async () => {
    await expect(
      assertMayOpenAccessForRecord(recordDb([3, 4]), 501, CONGREGATION, new Set(['can-view-programs'])),
    ).rejects.toBeInstanceOf(GrantBeyondActorError)
  })

  it('leaves identity roles out: an elder is an elder whoever opens the access', async () => {
    await expect(assertMayOpenAccessForRecord(recordDb([1]), 501, CONGREGATION, new Set())).resolves.toBeUndefined()
  })

  it('lets an administrator open any access', async () => {
    await expect(assertMayOpenAccessForRecord(recordDb([4]), 501, CONGREGATION, ADMIN_ACTOR)).resolves.toBeUndefined()
  })
})
