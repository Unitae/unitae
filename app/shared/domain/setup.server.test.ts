import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ROLE_KEY, ensureAdminRole } from '~/shared/domain/setup.server'
import { Permission } from '~/shared/types/permission'

const CONGREGATION_ID = 4242
const ADMIN_PERMISSION_ID = 7
const ADMIN_ROLE_ID = 99

type Fn = ReturnType<typeof vi.fn>

interface DbStub {
  permission: { findUnique: Fn }
  role: { upsert: Fn }
  rolePermission: { upsert: Fn }
}

function createDbStub(overrides: Partial<DbStub> = {}): DbStub {
  return {
    permission: { findUnique: vi.fn(async () => ({ id: ADMIN_PERMISSION_ID })) },
    role: { upsert: vi.fn(async () => ({ id: ADMIN_ROLE_ID })) },
    rolePermission: { upsert: vi.fn(async () => ({})) },
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ensureAdminRole', () => {
  it('returns the id of a role that grants admin', async () => {
    const db = createDbStub()

    await expect(ensureAdminRole(db, CONGREGATION_ID)).resolves.toBe(ADMIN_ROLE_ID)
  })

  it('creates it as a deletable custom role with no stored name', async () => {
    const db = createDbStub()

    await ensureAdminRole(db, CONGREGATION_ID)

    // isBuiltIn false so an admin can rename or delete it afterwards; no `name`
    // so the label comes from the message catalogue rather than pinning a
    // language into the database.
    const [args] = db.role.upsert.mock.calls[0]
    expect(args.create).toEqual({ key: ADMIN_ROLE_KEY, isBuiltIn: false, congregationId: CONGREGATION_ID })
  })

  it('attaches the admin permission to that role', async () => {
    const db = createDbStub()

    await ensureAdminRole(db, CONGREGATION_ID)

    const [args] = db.rolePermission.upsert.mock.calls[0]
    expect(args.create).toEqual({
      roleId: ADMIN_ROLE_ID,
      permissionId: ADMIN_PERMISSION_ID,
      congregationId: CONGREGATION_ID,
    })
    expect(db.permission.findUnique.mock.calls[0][0].where).toEqual({ key: Permission.Admin })
  })

  it('returns the same role on a second call without overwriting it', async () => {
    const db = createDbStub()

    const first = await ensureAdminRole(db, CONGREGATION_ID)
    const second = await ensureAdminRole(db, CONGREGATION_ID)

    expect(second).toBe(first)
    // Empty `update` on both writes: re-running provisioning must never clobber
    // a name or description an admin has since set on the role.
    for (const [args] of db.role.upsert.mock.calls) expect(args.update).toEqual({})
    for (const [args] of db.rolePermission.upsert.mock.calls) expect(args.update).toEqual({})
  })

  it('returns null, creating nothing, when the admin permission row is absent', async () => {
    const db = createDbStub({ permission: { findUnique: vi.fn(async () => null) } })

    await expect(ensureAdminRole(db, CONGREGATION_ID)).resolves.toBeNull()
    // Callers skip the role assignment on null. Creating a role that grants
    // nothing would be worse: it would look like the account had admin.
    expect(db.role.upsert).not.toHaveBeenCalled()
  })
})
