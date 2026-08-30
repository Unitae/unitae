import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: {
    RoleCreated: 'RoleCreated',
    RoleUpdated: 'RoleUpdated',
    RoleDeleted: 'RoleDeleted',
    RolePermissionChanged: 'RolePermissionChanged',
    UserRoleAssignmentChanged: 'UserRoleAssignmentChanged',
  },
  audit: vi.fn(),
}))
vi.mock('~/shared/auth/permissions.server', () => ({ requireNotLastAdmin: vi.fn() }))

const mockDb = {
  role: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  rolePermission: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
  },
  userRoleAssignment: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  permission: {
    findMany: vi.fn(),
  },
}

const {
  listRoles,
  createRole,
  updateRoleIdentity,
  updateRolePermissions,
  deleteRole,
  setUserCustomRoleAssignments,
  addUserToRole,
  removeUserFromRole,
} = await import('./roles.server')
const { audit } = await import('~/shared/domain/audit.server')
const { ConflictError, ForbiddenError } = await import('~/shared/errors/app-error.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('listRoles', () => {
  it('orders identity roles by canonical key, then system roles, then custom roles alphabetically', async () => {
    mockDb.role.findMany.mockResolvedValue([
      { id: 1, key: 'elder', name: null, description: null, isBuiltIn: true, _count: { permissions: 2, members: 5 } },
      {
        id: 2,
        key: 'speaker',
        name: 'Orateur',
        description: 'desc',
        isBuiltIn: false,
        _count: { permissions: 1, members: 3 },
      },
      {
        id: 3,
        key: 'member',
        name: null,
        description: null,
        isBuiltIn: true,
        _count: { permissions: 0, members: 10 },
      },
      {
        id: 5,
        key: 'admin',
        name: null,
        description: null,
        isBuiltIn: true,
        _count: { permissions: 1, members: 1 },
      },
      {
        id: 4,
        key: 'accountant',
        name: 'Comptable',
        description: '',
        isBuiltIn: false,
        _count: { permissions: 0, members: 1 },
      },
    ] as never)

    const roles = await listRoles(mockDb as never, 10)

    // Identity roles in BUILT_IN_ROLE_KEYS order, then system roles, then custom ones by
    // display name. `admin` is isBuiltIn but has no identity index — it must land after
    // the identity block, not level with the first of them.
    expect(roles.map(r => r.key)).toEqual(['member', 'elder', 'admin', 'accountant', 'speaker'])
  })
})

describe('createRole', () => {
  it('rejects duplicate role keys with ConflictError', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 99 } as never)

    await expect(
      createRole(mockDb as never, 10, 1, { name: 'Speaker', description: null, permissionKeys: [] }),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('audits with permission keys when role is created', async () => {
    mockDb.role.findFirst.mockResolvedValue(null as never)
    mockDb.role.create.mockResolvedValue({ id: 50, key: 'speaker' } as never)
    mockDb.permission.findMany.mockResolvedValue([{ id: 1, key: 'program-viewer' }] as never)
    mockDb.rolePermission.createMany.mockResolvedValue({ count: 1 } as never)

    await createRole(mockDb as never, 10, 1, {
      name: 'Speaker',
      description: 'Frères qualifiés',
      permissionKeys: ['program-viewer'],
    })

    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RoleCreated',
        entityType: 'Role',
        entityId: 50,
        metadata: { key: 'speaker', name: 'Speaker', permissionKeys: ['program-viewer'] },
      }),
    )
  })
})

describe('updateRoleIdentity', () => {
  it('rejects built-in roles with ForbiddenError', async () => {
    mockDb.role.findFirst.mockResolvedValue({
      id: 1,
      key: 'elder',
      name: null,
      description: null,
      isBuiltIn: true,
    } as never)

    await expect(updateRoleIdentity(mockDb as never, 1, 10, 1, { name: 'Anciens locaux' })).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(mockDb.role.update).not.toHaveBeenCalled()
  })

  it('does not audit RoleUpdated when nothing changed', async () => {
    mockDb.role.findFirst.mockResolvedValue({
      id: 7,
      key: 'speaker',
      name: 'Orateur',
      description: '',
      isBuiltIn: false,
    } as never)

    await updateRoleIdentity(mockDb as never, 7, 10, 1, { name: 'Orateur', description: '' })

    expect(mockDb.role.update).not.toHaveBeenCalled()
    expect(vi.mocked(audit)).not.toHaveBeenCalled()
  })

  it('audits RoleUpdated with fieldsChanged when name changes', async () => {
    mockDb.role.findFirst.mockResolvedValue({
      id: 7,
      key: 'speaker',
      name: 'Orateur',
      description: '',
      isBuiltIn: false,
    } as never)

    await updateRoleIdentity(mockDb as never, 7, 10, 1, { name: 'Orateurs' })

    expect(mockDb.role.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 7, congregationId: 10 } },
      data: { name: 'Orateurs' },
    })
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RoleUpdated', metadata: { fieldsChanged: ['name'] } }),
    )
  })
})

describe('updateRolePermissions', () => {
  it('does not audit when permissions are unchanged', async () => {
    mockDb.role.findFirst.mockResolvedValue({
      id: 7,
      key: 'speaker',
      name: 'Orateur',
      description: '',
      isBuiltIn: false,
      permissions: [{ permission: { key: 'program-viewer' } }],
    } as never)

    await updateRolePermissions(mockDb as never, 7, 10, 1, ['program-viewer'])

    const calls = vi.mocked(audit).mock.calls.map(c => (c[0] as { action: string }).action)
    expect(calls).not.toContain('RolePermissionChanged')
  })

  it('audits RolePermissionChanged with diffed keys (custom role)', async () => {
    mockDb.role.findFirst.mockResolvedValue({
      id: 7,
      key: 'speaker',
      name: 'Orateur',
      description: '',
      isBuiltIn: false,
      permissions: [{ permission: { key: 'program-viewer' } }, { permission: { key: 'board-uploader' } }],
    } as never)
    mockDb.permission.findMany.mockResolvedValue([
      { id: 1, key: 'program-manager' },
      { id: 2, key: 'board-uploader' },
    ] as never)
    mockDb.rolePermission.createMany.mockResolvedValue({ count: 1 } as never)
    mockDb.rolePermission.deleteMany.mockResolvedValue({ count: 1 } as never)

    await updateRolePermissions(mockDb as never, 7, 10, 1, ['program-viewer', 'program-manager'])

    const permissionAudit = vi
      .mocked(audit)
      .mock.calls.find(c => (c[0] as { action: string }).action === 'RolePermissionChanged')?.[0]
    expect((permissionAudit as { metadata: unknown }).metadata).toEqual({
      added: ['program-manager'],
      removed: ['board-uploader'],
    })
  })

  it('also works on built-in roles (admins can grant permissions to built-ins)', async () => {
    mockDb.role.findFirst.mockResolvedValue({
      id: 1,
      key: 'elder',
      name: null,
      description: null,
      isBuiltIn: true,
      permissions: [],
    } as never)
    mockDb.permission.findMany.mockResolvedValue([{ id: 100, key: 'board-uploader' }] as never)
    mockDb.rolePermission.createMany.mockResolvedValue({ count: 1 } as never)

    await updateRolePermissions(mockDb as never, 1, 10, 1, ['board-uploader'])

    expect(mockDb.rolePermission.createMany).toHaveBeenCalled()
  })
})

describe('deleteRole', () => {
  it('throws ForbiddenError on built-in roles', async () => {
    mockDb.role.findFirst.mockResolvedValue({
      id: 1,
      key: 'elder',
      name: null,
      isBuiltIn: true,
      _count: { members: 0 },
    } as never)

    await expect(deleteRole(mockDb as never, 1, 10, 1)).rejects.toBeInstanceOf(ForbiddenError)
    expect(mockDb.role.delete).not.toHaveBeenCalled()
  })

  it('deletes custom role and audits with member count', async () => {
    mockDb.role.findFirst.mockResolvedValue({
      id: 7,
      key: 'speaker',
      name: 'Orateur',
      isBuiltIn: false,
      _count: { members: 3 },
    } as never)
    // No organigram children: deleteRole checks before deleting so the admin gets a readable
    // refusal rather than a raw foreign-key violation.
    mockDb.role.findMany.mockResolvedValue([] as never)
    mockDb.role.delete.mockResolvedValue({} as never)

    await deleteRole(mockDb as never, 7, 10, 1)

    expect(mockDb.role.delete).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 7, congregationId: 10 } },
    })
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RoleDeleted',
        entityId: 7,
        metadata: { key: 'speaker', name: 'Orateur', memberCount: 3 },
      }),
    )
  })
})

describe('setUserCustomRoleAssignments', () => {
  it('keeps personal roles out of both sides of the diff', async () => {
    // Same shape as the built-in exclusion: a role the filter excludes is never granted here,
    // and — because the *existing* set is filtered too — never stripped either. A titulaire
    // keeps their seat when someone edits their eligibility groups.
    mockDb.role.findMany.mockResolvedValue([] as never)
    mockDb.userRoleAssignment.findMany.mockResolvedValue([] as never)

    await setUserCustomRoleAssignments(mockDb as never, 5, 10, 99, [])

    expect(mockDb.role.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isSinglePerson: false }) }),
    )
    expect(mockDb.userRoleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: expect.objectContaining({ isSinglePerson: false }) }),
      }),
    )
  })

  it('does not audit when desired set matches current set', async () => {
    mockDb.role.findMany.mockResolvedValue([
      { id: 5, key: 'speaker' },
      { id: 6, key: 'accountant' },
    ] as never)
    mockDb.userRoleAssignment.findMany.mockResolvedValue([{ roleId: 5 }] as never)

    await setUserCustomRoleAssignments(mockDb as never, 1, 10, 99, [5])

    expect(mockDb.userRoleAssignment.createMany).not.toHaveBeenCalled()
    expect(mockDb.userRoleAssignment.deleteMany).not.toHaveBeenCalled()
    expect(vi.mocked(audit)).not.toHaveBeenCalled()
  })

  it('only diffs account-assignable roles — identity role IDs are filtered out by the query', async () => {
    mockDb.role.findMany.mockResolvedValue([
      { id: 5, key: 'speaker' },
      { id: 6, key: 'accountant' },
    ] as never)
    mockDb.userRoleAssignment.findMany.mockResolvedValue([{ roleId: 5 }] as never)
    mockDb.userRoleAssignment.createMany.mockResolvedValue({ count: 1 } as never)
    mockDb.userRoleAssignment.deleteMany.mockResolvedValue({ count: 1 } as never)

    await setUserCustomRoleAssignments(mockDb as never, 1, 10, 99, [6, 999])

    // Custom roles OR system roles: identity roles attach to the Member and are
    // reconciled from its flags, but `admin` carries isBuiltIn too and must stay
    // grantable here — filtering on the flag alone would make it unassignable.
    const findManyCall = mockDb.userRoleAssignment.findMany.mock.calls[0][0]
    expect(findManyCall.where.role).toEqual({
      isSinglePerson: false,
      OR: [{ isBuiltIn: false }, { key: { in: ['admin'] } }],
    })

    const createCall = mockDb.userRoleAssignment.createMany.mock.calls[0][0]
    expect(createCall.data).toEqual([{ userId: 1, roleId: 6, congregationId: 10 }])

    const auditCall = vi
      .mocked(audit)
      .mock.calls.find(c => (c[0] as { action: string }).action === 'UserRoleAssignmentChanged')?.[0]
    expect((auditCall as { metadata: unknown }).metadata).toEqual({
      added: ['accountant'],
      removed: ['speaker'],
    })
  })
})

describe('addUserToRole', () => {
  it('rejects built-in roles with ForbiddenError', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 1, key: 'elder', isBuiltIn: true } as never)

    await expect(addUserToRole(mockDb as never, 5, 1, 10, 99)).rejects.toBeInstanceOf(ForbiddenError)
    expect(mockDb.userRoleAssignment.create).not.toHaveBeenCalled()
  })

  it('rejects personal roles — their one seat is granted from the organigram', async () => {
    // A blind add would write a plain `member` seat onto a role that has no members, only a
    // titulaire and adjoints, and would skip the handover seating exists to guarantee.
    mockDb.role.findFirst.mockResolvedValue({
      id: 7,
      key: 'responsable-audio-video',
      isBuiltIn: false,
      isSinglePerson: true,
    } as never)

    await expect(addUserToRole(mockDb as never, 5, 7, 10, 99)).rejects.toBeInstanceOf(ForbiddenError)
    expect(mockDb.userRoleAssignment.create).not.toHaveBeenCalled()
  })

  it('is idempotent — does not insert or audit when membership already exists', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 7, key: 'speaker', isBuiltIn: false } as never)
    mockDb.userRoleAssignment.findFirst.mockResolvedValue({ userId: 5 } as never)

    await addUserToRole(mockDb as never, 5, 7, 10, 99)

    expect(mockDb.userRoleAssignment.create).not.toHaveBeenCalled()
    expect(vi.mocked(audit)).not.toHaveBeenCalled()
  })

  it('creates assignment and audits with role key in added when membership is new', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 7, key: 'speaker', isBuiltIn: false } as never)
    mockDb.userRoleAssignment.findFirst.mockResolvedValue(null as never)
    mockDb.userRoleAssignment.create.mockResolvedValue({} as never)

    await addUserToRole(mockDb as never, 5, 7, 10, 99)

    expect(mockDb.userRoleAssignment.create).toHaveBeenCalledWith({
      data: { userId: 5, roleId: 7, congregationId: 10 },
    })
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UserRoleAssignmentChanged',
        entityType: 'User',
        entityId: 5,
        metadata: { added: ['speaker'], removed: [] },
      }),
    )
  })
})

describe('removeUserFromRole', () => {
  it('rejects built-in roles with ForbiddenError', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 1, key: 'elder', isBuiltIn: true } as never)

    await expect(removeUserFromRole(mockDb as never, 5, 1, 10, 99)).rejects.toBeInstanceOf(ForbiddenError)
    expect(mockDb.userRoleAssignment.deleteMany).not.toHaveBeenCalled()
  })

  it('is idempotent — does not delete or audit when membership does not exist', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 7, key: 'speaker', isBuiltIn: false } as never)
    mockDb.userRoleAssignment.findFirst.mockResolvedValue(null as never)

    await removeUserFromRole(mockDb as never, 5, 7, 10, 99)

    expect(mockDb.userRoleAssignment.deleteMany).not.toHaveBeenCalled()
    expect(vi.mocked(audit)).not.toHaveBeenCalled()
  })

  it.each([
    'leader',
    'deputy',
  ])('refuses to strip a %s seat — leadership changes hands on the organigram', async kind => {
    // The matrix bulk-edits members; one stray uncheck must not silently unseat a responsable.
    // Unseating leadership is the organigram's gesture, where the seat is visible as one.
    mockDb.role.findFirst.mockResolvedValue({ id: 7, key: 'sono', isBuiltIn: false } as never)
    mockDb.userRoleAssignment.findFirst.mockResolvedValue({ userId: 5, kind } as never)

    await expect(removeUserFromRole(mockDb as never, 5, 7, 10, 99)).rejects.toBeInstanceOf(ForbiddenError)
    expect(mockDb.userRoleAssignment.deleteMany).not.toHaveBeenCalled()
  })

  it('deletes assignment and audits with role key in removed when membership existed', async () => {
    mockDb.role.findFirst.mockResolvedValue({ id: 7, key: 'speaker', isBuiltIn: false } as never)
    mockDb.userRoleAssignment.findFirst.mockResolvedValue({ userId: 5 } as never)
    mockDb.userRoleAssignment.deleteMany.mockResolvedValue({ count: 1 } as never)

    await removeUserFromRole(mockDb as never, 5, 7, 10, 99)

    expect(mockDb.userRoleAssignment.deleteMany).toHaveBeenCalledWith({ where: { userId: 5, roleId: 7 } })
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UserRoleAssignmentChanged',
        entityType: 'User',
        entityId: 5,
        metadata: { added: [], removed: ['speaker'] },
      }),
    )
  })
})

const NAMES_THE_CHILD = /Secrétaire/

describe('deleteRole — organigram children', () => {
  it('refuses to delete a role that other roles report to, naming them', async () => {
    // The self-referencing FK is ON DELETE RESTRICT, so without this check the admin gets a raw
    // constraint violation and no idea which roles are in the way.
    mockDb.role.findFirst.mockResolvedValue({
      id: 1,
      key: 'comite',
      name: 'Comité de service',
      isBuiltIn: false,
      _count: { members: 0 },
    })
    mockDb.role.findMany.mockResolvedValue([
      { id: 2, key: 'secretaire', name: 'Secrétaire' },
      { id: 3, key: 'comptes', name: 'Comptes' },
    ])

    await expect(deleteRole(mockDb as never, 1, 10, 99)).rejects.toBeInstanceOf(ConflictError)
    await expect(deleteRole(mockDb as never, 1, 10, 99)).rejects.toThrow(NAMES_THE_CHILD)
    expect(mockDb.role.delete).not.toHaveBeenCalled()
  })

  it('deletes a role with no children', async () => {
    mockDb.role.findFirst.mockResolvedValue({
      id: 4,
      key: 'sono',
      name: 'Sono',
      isBuiltIn: false,
      _count: { members: 2 },
    })
    mockDb.role.findMany.mockResolvedValue([])
    mockDb.role.delete.mockResolvedValue({})

    await deleteRole(mockDb as never, 4, 10, 99)

    expect(mockDb.role.delete).toHaveBeenCalled()
  })
})
