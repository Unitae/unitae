import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ROLE_KEY, ensureAdminRole, placeDefaultOrganigram, seedBuiltInRoles } from '~/shared/domain/setup.server'
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

  it('creates it as an undeletable system role with no stored name', async () => {
    const db = createDbStub()

    await ensureAdminRole(db, CONGREGATION_ID)

    // isBuiltIn true: a congregation with no admin role cannot be administered, so
    // the role must not be renameable or deletable. No `name` so the label comes from
    // the message catalogue rather than pinning a language into the database.
    const [args] = db.role.upsert.mock.calls[0]
    expect(args.create).toEqual({ key: ADMIN_ROLE_KEY, isBuiltIn: true, congregationId: CONGREGATION_ID })
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
    expect(db.permission.findUnique.mock.calls[0][0].where).toEqual({ key: Permission.CanDoAnything })
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

// A congregation's first chart should not be a blank page. Every congregation has the same
// two rosters and the same service committee of three elders, so provisioning lays that down
// and the admin only hangs their own services off it.

interface RoleRow {
  id: number
  key: string
  showInOrganigram: boolean
  parentRoleId: number | null
  organigramOrder: number | null
}

/** In-memory Role table — the wiring under test is relational, so a call-counter proves nothing. */
function createRoleTable(seeded: string[] = []) {
  const rows: RoleRow[] = seeded.map((key, index) => ({
    id: 100 + index,
    key,
    showInOrganigram: false,
    parentRoleId: null,
    organigramOrder: null,
  }))
  let nextId = 200

  return {
    rows,
    client: {
      role: {
        upsert: vi.fn(
          async ({ where, create }: { where: { key_congregationId: { key: string } }; create: RoleRow }) => {
            const key = where.key_congregationId.key
            const found = rows.find(row => row.key === key)
            if (found) return found
            const row: RoleRow = {
              id: nextId++,
              key,
              showInOrganigram: create.showInOrganigram ?? false,
              parentRoleId: null,
              organigramOrder: null,
            }
            rows.push(row)
            return row
          },
        ),
        findMany: vi.fn(async ({ where }: { where: { key?: { in: string[] } } }) =>
          where.key ? rows.filter(row => where.key?.in.includes(row.key)) : rows,
        ),
        findUnique: vi.fn(
          async ({ where }: { where: { key_congregationId: { key: string } } }) =>
            rows.find(row => row.key === where.key_congregationId.key) ?? null,
        ),
        count: vi.fn(async () => rows.filter(row => row.showInOrganigram).length),
        update: vi.fn(
          async ({ where, data }: { where: { id_congregationId: { id: number } }; data: Partial<RoleRow> }) => {
            const row = rows.find(candidate => candidate.id === where.id_congregationId.id)
            if (row) Object.assign(row, data)
            return row
          },
        ),
      },
      permission: { findUnique: vi.fn(async () => null) },
      rolePermission: { upsert: vi.fn(async () => ({})) },
    },
  }
}

describe('seedBuiltInRoles — the service committee', () => {
  it('creates the committee and its three posts', async () => {
    const table = createRoleTable()

    await seedBuiltInRoles(table.client, CONGREGATION_ID)

    const keys = table.rows.map(row => row.key)
    expect(keys).toContain('service-committee')
    expect(keys).toEqual(expect.arrayContaining(['coordinator', 'secretary', 'service-overseer']))
  })

  it('stores no name, so the display string stays localisable', async () => {
    const table = createRoleTable()

    await seedBuiltInRoles(table.client, CONGREGATION_ID)

    const created = table.client.role.upsert.mock.calls.map(([arg]) => arg.create)
    for (const role of created) {
      expect(role).not.toHaveProperty('name')
    }
  })
})

describe('placeDefaultOrganigram', () => {
  it('puts the committee under the elders and the three posts inside it', async () => {
    const table = createRoleTable()
    await seedBuiltInRoles(table.client, CONGREGATION_ID)

    await placeDefaultOrganigram(table.client, CONGREGATION_ID)

    const byKey = new Map(table.rows.map(row => [row.key, row]))
    const elder = byKey.get('elder')
    const committee = byKey.get('service-committee')
    expect(elder?.showInOrganigram).toBe(true)
    expect(elder?.parentRoleId).toBeNull()
    expect(committee?.parentRoleId).toBe(elder?.id)
    for (const key of ['coordinator', 'secretary', 'service-overseer']) {
      expect(byKey.get(key)?.parentRoleId).toBe(committee?.id)
      expect(byKey.get(key)?.showInOrganigram).toBe(true)
    }
  })

  it('orders the three posts coordinator, secretary, service overseer', async () => {
    const table = createRoleTable()
    await seedBuiltInRoles(table.client, CONGREGATION_ID)

    await placeDefaultOrganigram(table.client, CONGREGATION_ID)

    const order = table.rows
      .filter(row => ['coordinator', 'secretary', 'service-overseer'].includes(row.key))
      .sort((a, b) => (a.organigramOrder ?? 0) - (b.organigramOrder ?? 0))
      .map(row => row.key)
    expect(order).toEqual(['coordinator', 'secretary', 'service-overseer'])
  })

  it('places the ministerial servants roster as a second root', async () => {
    const table = createRoleTable()
    await seedBuiltInRoles(table.client, CONGREGATION_ID)

    await placeDefaultOrganigram(table.client, CONGREGATION_ID)

    const servants = table.rows.find(row => row.key === 'assistant-servant')
    expect(servants?.showInOrganigram).toBe(true)
    expect(servants?.parentRoleId).toBeNull()
  })

  it('leaves an already-arranged chart alone', async () => {
    // The guard that matters: this must never resurrect a structure an admin has since
    // rearranged, nor duplicate one an existing congregation adopted by hand.
    const table = createRoleTable()
    await seedBuiltInRoles(table.client, CONGREGATION_ID)
    const existing = table.rows.find(row => row.key === 'elder')
    if (existing) existing.showInOrganigram = true

    await placeDefaultOrganigram(table.client, CONGREGATION_ID)

    expect(table.rows.find(row => row.key === 'service-committee')?.showInOrganigram).toBe(false)
  })
})
