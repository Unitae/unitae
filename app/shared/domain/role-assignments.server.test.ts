import { beforeEach, describe, expect, it } from 'vitest'
import { ValidationError } from '~/shared/errors/app-error.server'
import {
  findGivenSeat,
  giveRole,
  holderOfAccount,
  holderOfMember,
  moveGivenRolesOntoRecord,
  takeGivenRolesOfRecord,
  takeRole,
} from './role-assignments.server'

// An in-memory congregation: two assignment tables, accounts and records. The tests read the tables back rather than
// spying on calls, so they say where a role ends up, not how it got there.

interface Row {
  roleId: number
  congregationId: number
  kind: string
  memberId?: number
  userId?: number
}

const CONGREGATION = 10

function fakeDb() {
  const records: Row[] = []
  const logins: Row[] = []
  const accounts = [
    { id: 800, memberId: 500, congregationId: CONGREGATION },
    { id: 801, memberId: null, congregationId: CONGREGATION },
  ]
  const members = [
    { id: 500, congregationId: CONGREGATION, account: { id: 800 } },
    { id: 501, congregationId: CONGREGATION, account: null },
  ]
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) =>
      value != null && typeof value === 'object' && 'in' in value
        ? (value as { in: unknown[] }).in.includes(row[key as keyof Row])
        : row[key as keyof Row] === value,
    )
  const roleKeys: Record<number, string> = { 1: 'admin', 2: 'elder', 3: 'sono', 4: 'lecteurs' }
  const table = (rows: Row[]) => ({
    findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find(row => matches(row, where)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      rows
        .filter(row => matches(row, where))
        .map(row => ({ ...row, role: { id: row.roleId, key: roleKeys[row.roleId] } })),
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: Record<string, Record<string, unknown>>
      create: Row
      update: Partial<Row>
    }) => {
      const key = Object.values(where)[0] ?? {}
      const found = rows.find(row => matches(row, key))
      if (found) Object.assign(found, update)
      else rows.push({ ...create })
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i]
        if (row && matches(row, where)) rows.splice(i, 1)
      }
    },
  })
  return {
    records,
    logins,
    db: {
      memberRoleAssignment: table(records),
      userRoleAssignment: table(logins),
      userAccount: {
        findFirst: async ({ where }: { where: { id: number; congregationId: number } }) =>
          accounts.find(a => a.id === where.id && a.congregationId === where.congregationId) ?? null,
      },
      member: {
        findFirst: async ({ where }: { where: { id: number; congregationId: number } }) =>
          members.find(m => m.id === where.id && m.congregationId === where.congregationId) ?? null,
      },
    } as never,
  }
}

const TEAM = { id: 3, key: 'sono' }
const ADMIN = { id: 1, key: 'admin' }

let fake: ReturnType<typeof fakeDb>
beforeEach(() => {
  fake = fakeDb()
})

describe('holderOfAccount / holderOfMember', () => {
  it('reaches the record of an account that has one', async () => {
    expect(await holderOfAccount(fake.db, 800, CONGREGATION)).toEqual({ memberId: 500, userId: 800 })
  })

  it('stays on an account without a record', async () => {
    expect(await holderOfAccount(fake.db, 801, CONGREGATION)).toEqual({ memberId: null, userId: 801 })
  })

  it('reaches a record with its login, or none', async () => {
    expect(await holderOfMember(fake.db, 500, CONGREGATION)).toEqual({ memberId: 500, userId: 800 })
    expect(await holderOfMember(fake.db, 501, CONGREGATION)).toEqual({ memberId: 501, userId: null })
  })

  it('finds nobody of another congregation', async () => {
    expect(await holderOfAccount(fake.db, 800, 99)).toBeNull()
    expect(await holderOfMember(fake.db, 500, 99)).toBeNull()
  })
})

describe('giveRole', () => {
  it('puts a role on the record, with its seat', async () => {
    await giveRole(fake.db, { memberId: 500, userId: 800 }, TEAM, CONGREGATION, 'leader')
    expect(fake.records).toEqual([{ memberId: 500, roleId: 3, congregationId: CONGREGATION, kind: 'leader' }])
    expect(fake.logins).toEqual([])
  })

  it('gives a role to a publisher without an account', async () => {
    await giveRole(fake.db, { memberId: 501, userId: null }, TEAM, CONGREGATION)
    expect(fake.records).toEqual([{ memberId: 501, roleId: 3, congregationId: CONGREGATION, kind: 'member' }])
  })

  it('moves a role the login still held onto the record', async () => {
    fake.logins.push({ userId: 800, roleId: 3, congregationId: CONGREGATION, kind: 'deputy' })
    await giveRole(fake.db, { memberId: 500, userId: 800 }, TEAM, CONGREGATION, 'deputy')
    expect(fake.logins).toEqual([])
    expect(fake.records).toEqual([{ memberId: 500, roleId: 3, congregationId: CONGREGATION, kind: 'deputy' }])
  })

  it('changes the seat of a role already held', async () => {
    await giveRole(fake.db, { memberId: 500, userId: 800 }, TEAM, CONGREGATION, 'member')
    await giveRole(fake.db, { memberId: 500, userId: 800 }, TEAM, CONGREGATION, 'leader')
    expect(fake.records).toEqual([{ memberId: 500, roleId: 3, congregationId: CONGREGATION, kind: 'leader' }])
  })

  it('keeps a role given to an account without a record on the account', async () => {
    await giveRole(fake.db, { memberId: null, userId: 801 }, TEAM, CONGREGATION)
    expect(fake.logins).toEqual([{ userId: 801, roleId: 3, congregationId: CONGREGATION, kind: 'member' }])
  })

  it('keeps admin on the login, even for a person with a record', async () => {
    await giveRole(fake.db, { memberId: 500, userId: 800 }, ADMIN, CONGREGATION)
    expect(fake.logins).toEqual([{ userId: 800, roleId: 1, congregationId: CONGREGATION, kind: 'member' }])
    expect(fake.records).toEqual([])
  })

  it('refuses admin to someone without a login', async () => {
    await expect(giveRole(fake.db, { memberId: 501, userId: null }, ADMIN, CONGREGATION)).rejects.toBeInstanceOf(
      ValidationError,
    )
  })
})

describe('takeRole', () => {
  it('takes a role off the record and off the login alike', async () => {
    fake.records.push({ memberId: 500, roleId: 3, congregationId: CONGREGATION, kind: 'member' })
    fake.logins.push({ userId: 800, roleId: 3, congregationId: CONGREGATION, kind: 'member' })
    await takeRole(fake.db, { memberId: 500, userId: 800 }, TEAM, CONGREGATION)
    expect(fake.records).toEqual([])
    expect(fake.logins).toEqual([])
  })

  it('leaves the holder’s other roles', async () => {
    fake.records.push({ memberId: 500, roleId: 4, congregationId: CONGREGATION, kind: 'member' })
    await takeRole(fake.db, { memberId: 500, userId: 800 }, TEAM, CONGREGATION)
    expect(fake.records).toHaveLength(1)
  })
})

describe('findGivenSeat', () => {
  it('reads the seat from the record first, then the login', async () => {
    expect(await findGivenSeat(fake.db, { memberId: 500, userId: 800 }, TEAM, CONGREGATION)).toBeNull()
    fake.logins.push({ userId: 800, roleId: 3, congregationId: CONGREGATION, kind: 'deputy' })
    expect(await findGivenSeat(fake.db, { memberId: 500, userId: 800 }, TEAM, CONGREGATION)).toBe('deputy')
    fake.records.push({ memberId: 500, roleId: 3, congregationId: CONGREGATION, kind: 'leader' })
    expect(await findGivenSeat(fake.db, { memberId: 500, userId: 800 }, TEAM, CONGREGATION)).toBe('leader')
  })
})

describe('moveGivenRolesOntoRecord', () => {
  it('brings the roles a login had onto the record it is linked to, seats included, and leaves admin', async () => {
    fake.logins.push({ userId: 800, roleId: 3, congregationId: CONGREGATION, kind: 'leader' })
    fake.logins.push({ userId: 800, roleId: 4, congregationId: CONGREGATION, kind: 'member' })
    fake.logins.push({ userId: 800, roleId: 1, congregationId: CONGREGATION, kind: 'member' })
    await moveGivenRolesOntoRecord(fake.db, 800, 500, CONGREGATION)
    expect(fake.records).toEqual([
      { memberId: 500, roleId: 3, congregationId: CONGREGATION, kind: 'leader' },
      { memberId: 500, roleId: 4, congregationId: CONGREGATION, kind: 'member' },
    ])
    expect(fake.logins).toEqual([{ userId: 800, roleId: 1, congregationId: CONGREGATION, kind: 'member' }])
  })
})

describe('takeGivenRolesOfRecord', () => {
  it('takes every role given by hand off a record and leaves the identity roles to their sync', async () => {
    fake.records.push({ memberId: 500, roleId: 2, congregationId: CONGREGATION, kind: 'member' })
    fake.records.push({ memberId: 500, roleId: 3, congregationId: CONGREGATION, kind: 'leader' })
    fake.records.push({ memberId: 501, roleId: 3, congregationId: CONGREGATION, kind: 'member' })
    await takeGivenRolesOfRecord(fake.db, 500, CONGREGATION)
    expect(fake.records).toEqual([
      { memberId: 500, roleId: 2, congregationId: CONGREGATION, kind: 'member' },
      { memberId: 501, roleId: 3, congregationId: CONGREGATION, kind: 'member' },
    ])
  })
})
