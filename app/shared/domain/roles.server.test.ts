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
  it('returns built-in roles first ordered by canonical key, then custom roles alphabetically', async () => {
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
        key: 'male',
        name: null,
        description: null,
        isBuiltIn: true,
        _count: { permissions: 0, members: 10 },
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

    expect(roles.map(r => r.key)).toEqual(['male', 'elder', 'accountant', 'speaker'])
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

  it('only diffs custom assignments — built-in role IDs are filtered out by the query', async () => {
    mockDb.role.findMany.mockResolvedValue([
      { id: 5, key: 'speaker' },
      { id: 6, key: 'accountant' },
    ] as never)
    mockDb.userRoleAssignment.findMany.mockResolvedValue([{ roleId: 5 }] as never)
    mockDb.userRoleAssignment.createMany.mockResolvedValue({ count: 1 } as never)
    mockDb.userRoleAssignment.deleteMany.mockResolvedValue({ count: 1 } as never)

    await setUserCustomRoleAssignments(mockDb as never, 1, 10, 99, [6, 999])

    const findManyCall = mockDb.userRoleAssignment.findMany.mock.calls[0][0]
    expect(findManyCall.where.role).toEqual({ isBuiltIn: false })

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
