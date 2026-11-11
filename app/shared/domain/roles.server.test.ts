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

const { listRoles, createRole, updateRoleIdentity, updateRolePermissions, deleteRole } = await import('./roles.server')
const { audit } = await import('~/shared/domain/audit.server')
const { ConflictError, ForbiddenError } = await import('~/shared/errors/app-error.server')

// The actor's permissions: an admin, so grant limits never interfere with what these tests cover.
const ADMIN_ACTOR = new Set(['can-do-anything'])

beforeEach(() => {
  vi.resetAllMocks()
})

describe('listRoles', () => {
  it('orders identity roles by canonical key, then system roles, then custom roles alphabetically', async () => {
    mockDb.role.findMany.mockResolvedValue([
      {
        id: 1,
        key: 'elder',
        name: null,
        description: null,
        isBuiltIn: true,
        _count: { permissions: 2, members: 5, memberAssignments: 0 },
      },
      {
        id: 2,
        key: 'speaker',
        name: 'Orateur',
        description: 'desc',
        isBuiltIn: false,
        _count: { permissions: 1, members: 3, memberAssignments: 0 },
      },
      {
        id: 3,
        key: 'member',
        name: null,
        description: null,
        isBuiltIn: true,
        _count: { permissions: 0, members: 10, memberAssignments: 0 },
      },
      {
        id: 5,
        key: 'admin',
        name: null,
        description: null,
        isBuiltIn: true,
        _count: { permissions: 1, members: 1, memberAssignments: 0 },
      },
      {
        id: 4,
        key: 'accountant',
        name: 'Comptable',
        description: '',
        isBuiltIn: false,
        _count: { permissions: 0, members: 1, memberAssignments: 0 },
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

    await updateRolePermissions(mockDb as never, 7, 10, 1, ['program-viewer'], ADMIN_ACTOR)

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

    await updateRolePermissions(mockDb as never, 7, 10, 1, ['program-viewer', 'program-manager'], ADMIN_ACTOR)

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

    await updateRolePermissions(mockDb as never, 1, 10, 1, ['board-uploader'], ADMIN_ACTOR)

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
      _count: { members: 0, memberAssignments: 0 },
    } as never)

    await expect(deleteRole(mockDb as never, 1, 10, 1, new Set(['can-do-anything']))).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(mockDb.role.delete).not.toHaveBeenCalled()
  })

  it('deletes custom role and audits with member count', async () => {
    mockDb.role.findFirst.mockResolvedValue({
      id: 7,
      key: 'speaker',
      name: 'Orateur',
      isBuiltIn: false,
      _count: { members: 3, memberAssignments: 0 },
    } as never)
    // No organigram children: deleteRole checks before deleting so the admin gets a readable
    // refusal rather than a raw foreign-key violation.
    mockDb.role.findMany.mockResolvedValue([] as never)
    mockDb.role.delete.mockResolvedValue({} as never)

    await deleteRole(mockDb as never, 7, 10, 1, new Set(['can-do-anything']))

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
      _count: { members: 0, memberAssignments: 0 },
    })
    mockDb.role.findMany.mockResolvedValue([
      { id: 2, key: 'secretaire', name: 'Secrétaire' },
      { id: 3, key: 'comptes', name: 'Comptes' },
    ])

    await expect(deleteRole(mockDb as never, 1, 10, 99, new Set(['can-do-anything']))).rejects.toBeInstanceOf(
      ConflictError,
    )
    await expect(deleteRole(mockDb as never, 1, 10, 99, new Set(['can-do-anything']))).rejects.toThrow(NAMES_THE_CHILD)
    expect(mockDb.role.delete).not.toHaveBeenCalled()
  })

  it('deletes a role with no children', async () => {
    mockDb.role.findFirst.mockResolvedValue({
      id: 4,
      key: 'sono',
      name: 'Sono',
      isBuiltIn: false,
      _count: { members: 2, memberAssignments: 0 },
    })
    mockDb.role.findMany.mockResolvedValue([])
    mockDb.role.delete.mockResolvedValue({})

    await deleteRole(mockDb as never, 4, 10, 99, new Set(['can-do-anything']))

    expect(mockDb.role.delete).toHaveBeenCalled()
  })
})
