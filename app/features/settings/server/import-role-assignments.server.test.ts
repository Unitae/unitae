import { beforeEach, describe, expect, it, vi } from 'vitest'

// Restoring who holds which role. A role given by hand belongs to the person: on their record when they have one,
// the same rule the 2.12 migration applies to live data, so a restored backup gives exactly what migrating did.

const readNdjsonFile = vi.fn()
vi.mock('./ndjson-archive', () => ({ readNdjsonFile: (...args: unknown[]) => readNdjsonFile(...args) }))

const { importMemberRoleAssignments, importUserRoleAssignments } = await import('./import-role-assignments.server')
const { EntityIdMap } = await import('./data-transfer.type')

const CONGREGATION = 42

// Imported ids: archive role 1 → 101 (admin), 2 → 102 (sono), 3 → 103 (elder); archive account 5 → 805 (linked to
// imported record 905), 6 → 806 (no record); archive member 7 → 907.
function idMap() {
  const map = new EntityIdMap()
  map.set('roles', 1, 101)
  map.set('roles', 2, 102)
  map.set('roles', 3, 103)
  map.set('user-accounts', 5, 805)
  map.set('user-accounts', 6, 806)
  map.set('members', 7, 907)
  return map
}

const KEYS: Record<number, string> = { 101: 'admin', 102: 'sono', 103: 'elder' }

function makeDb() {
  return {
    role: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: number[] } } }) =>
        where.id.in.map(id => ({ id, key: KEYS[id] })),
      ),
    },
    userAccount: {
      findMany: vi.fn(async () => [
        { id: 805, memberId: 905 },
        { id: 806, memberId: null },
      ]),
    },
    userRoleAssignment: { createMany: vi.fn() },
    memberRoleAssignment: { createMany: vi.fn() },
  }
}

function archive(files: Record<string, unknown[]>) {
  readNdjsonFile.mockImplementation((_zip: unknown, name: string) => Promise.resolve(files[name] ?? []))
}

const loginRows = (db: ReturnType<typeof makeDb>) => db.userRoleAssignment.createMany.mock.calls[0]?.[0].data ?? []
const recordRows = (db: ReturnType<typeof makeDb>) => db.memberRoleAssignment.createMany.mock.calls[0]?.[0].data ?? []

beforeEach(() => {
  vi.resetAllMocks()
})

describe('importUserRoleAssignments', () => {
  it('puts a linked login’s roles on its record, seat included, and keeps admin on the login', async () => {
    archive({
      'user-role-assignments': [
        { userId: 5, roleId: 2, kind: 'leader' },
        { userId: 5, roleId: 1, kind: 'member' },
      ],
    })
    const db = makeDb()
    await importUserRoleAssignments({} as never, db as never, idMap(), CONGREGATION)
    expect(recordRows(db)).toEqual([{ memberId: 905, roleId: 102, congregationId: CONGREGATION, kind: 'leader' }])
    expect(loginRows(db)).toEqual([{ userId: 805, roleId: 101, congregationId: CONGREGATION, kind: 'member' }])
  })

  it('keeps the roles of a login without a record on the login', async () => {
    archive({ 'user-role-assignments': [{ userId: 6, roleId: 2, kind: 'deputy' }] })
    const db = makeDb()
    await importUserRoleAssignments({} as never, db as never, idMap(), CONGREGATION)
    expect(loginRows(db)).toEqual([{ userId: 806, roleId: 102, congregationId: CONGREGATION, kind: 'deputy' }])
    expect(recordRows(db)).toEqual([])
  })

  it('restores a seat missing from an old archive as a plain member, and skips what it cannot map', async () => {
    archive({
      'user-role-assignments': [
        { userId: 6, roleId: 2 },
        { userId: 99, roleId: 2 },
        { userId: 6, roleId: 99 },
      ],
    })
    const db = makeDb()
    await importUserRoleAssignments({} as never, db as never, idMap(), CONGREGATION)
    expect(loginRows(db)).toEqual([{ userId: 806, roleId: 102, congregationId: CONGREGATION, kind: 'member' }])
  })
})

describe('importMemberRoleAssignments', () => {
  it('restores the roles given to a record, seat included', async () => {
    archive({ 'member-role-assignments': [{ memberId: 7, roleId: 2, kind: 'deputy' }] })
    const db = makeDb()
    await importMemberRoleAssignments({} as never, db as never, idMap(), CONGREGATION)
    expect(recordRows(db)).toEqual([{ memberId: 907, roleId: 102, congregationId: CONGREGATION, kind: 'deputy' }])
  })

  it('leaves identity roles to the record’s flags, which the member import already synced', async () => {
    archive({ 'member-role-assignments': [{ memberId: 7, roleId: 3 }] })
    const db = makeDb()
    await importMemberRoleAssignments({} as never, db as never, idMap(), CONGREGATION)
    expect(db.memberRoleAssignment.createMany).not.toHaveBeenCalled()
  })
})
