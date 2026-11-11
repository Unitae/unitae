import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listRolesForPermissions } = await import('./role-permissions.queries')

const db = { role: { findMany: vi.fn() } }
const role = (overrides: Record<string, unknown>) => ({
  id: 1,
  key: 'custom',
  name: null,
  description: null,
  isBuiltIn: false,
  permissions: [],
  _count: { members: 0, memberAssignments: 0 },
  ...overrides,
})

beforeEach(() => vi.resetAllMocks())

describe('listRolesForPermissions', () => {
  it('sorts the roles into the administrator, the congregation’s roles and the record’s roles', async () => {
    db.role.findMany.mockResolvedValue([
      role({ id: 4, key: 'elder', isBuiltIn: true }),
      role({ id: 2, key: 'sono', name: 'Sonorisation' }),
      role({ id: 1, key: 'admin', isBuiltIn: true }),
      role({ id: 3, key: 'coordinator', isBuiltIn: true }),
    ])

    const roles = await listRolesForPermissions(db as never, 3)

    expect(roles.map(r => [r.key, r.group])).toEqual([
      ['admin', 'admin'],
      ['coordinator', 'congregation'],
      ['sono', 'congregation'],
      ['elder', 'record'],
    ])
  })

  it('counts who holds a role through an account or a record, and lists its permissions', async () => {
    db.role.findMany.mockResolvedValue([
      role({
        id: 2,
        key: 'territories',
        name: 'Territoires',
        permissions: [
          { permission: { key: 'can-view-territories' } },
          { permission: { key: 'can-manage-territories' } },
        ],
        _count: { members: 2, memberAssignments: 1 },
      }),
    ])

    const [territories] = await listRolesForPermissions(db as never, 3)

    expect(territories?.people).toBe(3)
    expect(territories?.permissionKeys).toEqual(['can-view-territories', 'can-manage-territories'])
  })
})
