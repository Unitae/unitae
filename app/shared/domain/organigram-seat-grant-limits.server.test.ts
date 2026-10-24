import { beforeEach, describe, expect, it, vi } from 'vitest'

// Seating someone in an organigram node grants that role's permissions, and a committee post also
// grants the committee's. The same limits as the role matrix apply: the actor must hold every
// permission granted or revoked, only an admin changes an admin's access, and the last admin keeps
// the admin role.

vi.mock('~/shared/domain/service-committee.server', () => ({ syncServiceCommitteeMembers: vi.fn() }))
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { OrganigramChanged: 'OrganigramChanged', UserRoleAssignmentChanged: 'UserRoleAssignmentChanged' },
  audit: vi.fn(),
}))

const { adminIds } = vi.hoisted(() => ({ adminIds: new Set<number>() }))
vi.mock('~/shared/auth/permissions.server', async () => {
  const { ConflictError } = await import('~/shared/errors/app-error.server')
  return {
    isAccountAdmin: vi.fn(async (accountId: number) => adminIds.has(accountId)),
    requireNotLastAdmin: vi.fn(async (accountId: number) => {
      if (adminIds.has(accountId) && adminIds.size === 1) throw new ConflictError('last admin')
    }),
  }
})

const ROLES = [
  { id: 1, key: 'admin', isSinglePerson: false, parentRoleId: null, permissions: ['can-do-anything'] },
  { id: 2, key: 'sono', isSinglePerson: false, parentRoleId: null, permissions: ['can-view-programs'] },
  { id: 3, key: 'payroll', isSinglePerson: false, parentRoleId: null, permissions: ['can-manage-users'] },
  { id: 4, key: 'secretary', isSinglePerson: true, parentRoleId: 5, permissions: [] as string[] },
  { id: 5, key: 'service-committee', isSinglePerson: false, parentRoleId: null, permissions: ['can-view-activity'] },
  { id: 6, key: 'audio-lead', isSinglePerson: true, parentRoleId: null, permissions: ['can-view-programs'] },
  { id: 8, key: 'super-lead', isSinglePerson: true, parentRoleId: null, permissions: ['can-do-anything'] },
]

let assignments: { userId: number; roleId: number; kind: string }[] = []

const db = {
  role: {
    findFirst: vi.fn(
      async ({ where }: { where: { id?: number; key?: string } }) =>
        ROLES.find(r => (where.id != null ? r.id === where.id : r.key === where.key)) ?? null,
    ),
  },
  member: {
    findFirst: vi.fn(async ({ where }: { where: { id: number } }) => ({
      id: where.id,
      account: { id: where.id + 100 },
    })),
  },
  // Every seated person in these tests is an elder, so the committee rule never interferes.
  memberRoleAssignment: { findFirst: vi.fn(async () => ({ memberId: 1 })) },
  rolePermission: {
    findMany: vi.fn(async ({ where }: { where: { roleId: { in: number[] } } }) =>
      ROLES.filter(r => where.roleId.in.includes(r.id)).flatMap(r =>
        r.permissions.map(key => ({ permission: { key } })),
      ),
    ),
    findFirst: vi.fn(async ({ where }: { where: { roleId: { in: number[] } } }) =>
      ROLES.some(r => where.roleId.in.includes(r.id) && r.permissions.includes('can-do-anything'))
        ? { roleId: 1 }
        : null,
    ),
  },
  userRoleAssignment: {
    findFirst: vi.fn(
      async ({ where }: { where: { userId: number; roleId: number } }) =>
        assignments.find(a => a.userId === where.userId && a.roleId === where.roleId) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: { userId: number; roleId: number; kind: string } }) => {
      assignments.push({ userId: data.userId, roleId: data.roleId, kind: data.kind })
    }),
    update: vi.fn(),
    findMany: vi.fn(async ({ where }: { where: { roleId: number; kind: string; NOT: { userId: number } } }) =>
      assignments
        .filter(a => a.roleId === where.roleId && a.kind === where.kind && a.userId !== where.NOT.userId)
        .map(a => ({ userId: a.userId })),
    ),
    deleteMany: vi.fn(
      async ({ where }: { where: { userId?: number; roleId: number; kind?: string; NOT?: { userId: number } } }) => {
        assignments = assignments.filter(a => {
          if (a.roleId !== where.roleId) return true
          if (where.userId != null) return a.userId !== where.userId
          return !(a.kind === where.kind && a.userId !== where.NOT?.userId)
        })
      },
    ),
  },
}

const { seatMember, unseatMember } = await import('./organigram-seats.server')
const { adoptServiceCommittee } = await import('./organigram-adoption.server')
const { ConflictError, ForbiddenError } = await import('~/shared/errors/app-error.server')

const ROLE_MANAGER = new Set(['can-manage-roles', 'can-view-programs'])
const ADMIN = new Set(['can-do-anything'])
// Member 7 has account 107.
const SELF = 7

beforeEach(() => {
  assignments = []
  adminIds.clear()
})

describe('seatMember grant limits', () => {
  it('refuses to seat anyone in the admin role for an actor who is not an admin', async () => {
    await expect(
      seatMember(db as never, { roleId: 1, memberId: SELF, kind: 'member' }, 10, 7, ROLE_MANAGER),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(assignments).toEqual([])
  })

  it('refuses a seat whose role carries a permission the actor lacks', async () => {
    await expect(
      seatMember(db as never, { roleId: 3, memberId: SELF, kind: 'member' }, 10, 7, ROLE_MANAGER),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(assignments).toEqual([])
  })

  it('refuses a committee post when the committee carries a permission the actor lacks', async () => {
    await expect(
      seatMember(db as never, { roleId: 4, memberId: SELF, kind: 'leader' }, 10, 7, ROLE_MANAGER),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(assignments).toEqual([])
  })

  it('seats someone in a role whose permissions the actor holds', async () => {
    await seatMember(db as never, { roleId: 2, memberId: SELF, kind: 'member' }, 10, 7, ROLE_MANAGER)
    expect(assignments).toEqual([{ userId: 107, roleId: 2, kind: 'member' }])
  })

  it("refuses to change an admin's seats for an actor who is not an admin", async () => {
    adminIds.add(107)
    await expect(
      seatMember(db as never, { roleId: 2, memberId: SELF, kind: 'member' }, 10, 9, ROLE_MANAGER),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(assignments).toEqual([])
  })

  it('lets an admin seat someone in the admin role', async () => {
    await seatMember(db as never, { roleId: 1, memberId: SELF, kind: 'member' }, 10, 9, ADMIN)
    expect(assignments).toEqual([{ userId: 107, roleId: 1, kind: 'member' }])
  })
})

describe('unseatMember grant limits', () => {
  it('refuses to unseat anyone from the admin role for an actor who is not an admin', async () => {
    assignments = [{ userId: 107, roleId: 1, kind: 'member' }]
    await expect(unseatMember(db as never, 1, SELF, 10, 9, ROLE_MANAGER)).rejects.toBeInstanceOf(ForbiddenError)
    expect(assignments).toHaveLength(1)
  })

  it('refuses to unseat the last admin from the admin role', async () => {
    adminIds.add(107)
    assignments = [{ userId: 107, roleId: 1, kind: 'member' }]
    await expect(unseatMember(db as never, 1, SELF, 10, 9, ADMIN)).rejects.toBeInstanceOf(ConflictError)
    expect(assignments).toHaveLength(1)
  })
})

describe('adoptServiceCommittee grant limits', () => {
  const writes: string[] = []
  const permissionsByRole = new Map<number, string[]>([
    [22, ['can-manage-users']],
    [21, ['can-view-programs']],
  ])
  const adoptionDb = {
    role: {
      findMany: vi.fn(async () => [
        { id: 1, key: 'elder', name: null, parentRoleId: null, showInOrganigram: true },
        { id: 2, key: 'service-committee', name: null, parentRoleId: null, showInOrganigram: false },
        { id: 3, key: 'coordinator', name: null, parentRoleId: null, showInOrganigram: false },
        { id: 4, key: 'secretary', name: null, parentRoleId: null, showInOrganigram: false },
        { id: 21, key: 'coordinateur', name: 'Coordinateur', parentRoleId: null, showInOrganigram: true },
        { id: 22, key: 'secretaire', name: 'Secrétaire', parentRoleId: null, showInOrganigram: true },
      ]),
      update: vi.fn(async () => {
        writes.push('role.update')
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    rolePermission: {
      findMany: vi.fn(async ({ where }: { where: { roleId: number | { in: number[] } } }) => {
        const ids = typeof where.roleId === 'number' ? [where.roleId] : where.roleId.in
        return ids.flatMap(id =>
          (permissionsByRole.get(id) ?? []).map(key => ({ permission: { key }, permissionId: 1 })),
        )
      }),
      createMany: vi.fn(async () => {
        writes.push('rolePermission.createMany')
        return { count: 0 }
      }),
    },
    userRoleAssignment: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => {
        writes.push('userRoleAssignment.create')
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  }

  beforeEach(() => {
    writes.length = 0
  })

  it('refuses a mapping that carries a permission the actor lacks, before any write', async () => {
    await expect(
      adoptServiceCommittee(adoptionDb as never, [{ postKey: 'secretary', fromRoleId: 22 }], 10, 7, ROLE_MANAGER),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(writes).toEqual([])
  })

  it('adopts a mapping within the actor’s permissions', async () => {
    await adoptServiceCommittee(adoptionDb as never, [{ postKey: 'coordinator', fromRoleId: 21 }], 10, 7, ROLE_MANAGER)
    expect(writes).toContain('role.update')
  })
})

describe('handover grant limits (second review)', () => {
  it('refuses a handover that unseats an admin, for an actor who is not an admin', async () => {
    adminIds.add(108)
    assignments = [{ userId: 108, roleId: 6, kind: 'leader' }]
    await expect(
      seatMember(db as never, { roleId: 6, memberId: SELF, kind: 'leader' }, 10, 9, ROLE_MANAGER),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(assignments).toEqual([{ userId: 108, roleId: 6, kind: 'leader' }])
  })

  it('refuses a handover that would take an admin-carrying post from the last admin', async () => {
    adminIds.add(108)
    assignments = [{ userId: 108, roleId: 8, kind: 'leader' }]
    await expect(
      seatMember(db as never, { roleId: 8, memberId: SELF, kind: 'leader' }, 10, 108, ADMIN),
    ).rejects.toBeInstanceOf(ConflictError)
    expect(assignments).toEqual([{ userId: 108, roleId: 8, kind: 'leader' }])
  })

  it('hands over a seat whose outgoing titulaire the actor may manage, keeping the deputies', async () => {
    assignments = [
      { userId: 108, roleId: 6, kind: 'leader' },
      { userId: 109, roleId: 6, kind: 'deputy' },
    ]
    await seatMember(db as never, { roleId: 6, memberId: SELF, kind: 'leader' }, 10, 9, ROLE_MANAGER)
    expect(assignments).toEqual([
      { userId: 109, roleId: 6, kind: 'deputy' },
      { userId: 107, roleId: 6, kind: 'leader' },
    ])
  })
})
