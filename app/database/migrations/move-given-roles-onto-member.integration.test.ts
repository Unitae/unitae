import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL: a migration executes as the schema owner, which the RLS-bound runtime role is not.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

const MIGRATION_SQL = resolve(import.meta.dirname, '20261111120000_move_given_roles_onto_member', 'migration.sql')

/** The shipped file, split into statements: a test that re-typed the SQL would pass after an edit. */
function migrationStatements(): string[] {
  return readFileSync(MIGRATION_SQL, 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0)
}

/** Thrown to roll the fixture back; every assertion runs on captured values. */
class Rollback extends Error {}

type Tx = Parameters<Parameters<typeof testDb.$transaction>[0]>[0]

afterAll(async () => {
  await testDb.$disconnect()
})

interface Seat {
  roleKey: string
  kind: string
}

/**
 * Every role a person reaches, with its seat, from both tables: what the app resolves. Re-derived here rather than
 * through the app's resolvers, which bind their own client and cannot see the uncommitted fixture.
 */
async function seatsOf(tx: Tx, memberId: number | null, userId: number | null): Promise<string[]> {
  const onRecord =
    memberId == null
      ? []
      : await tx.memberRoleAssignment.findMany({
          where: { memberId },
          select: { kind: true, role: { select: { key: true } } },
        })
  const onLogin =
    userId == null
      ? []
      : await tx.userRoleAssignment.findMany({
          where: { userId },
          select: { kind: true, role: { select: { key: true } } },
        })
  const seats: Seat[] = [...onRecord, ...onLogin].map(row => ({ roleKey: row.role.key, kind: row.kind }))
  return seats.map(seat => `${seat.roleKey}:${seat.kind}`).sort()
}

interface Person {
  label: string
  memberId: number | null
  userId: number | null
}

interface Captured {
  before: Record<string, string[]>
  after: Record<string, string[]>
  afterSecondRun: Record<string, string[]>
  onLoginAfter: Record<string, string[]>
  onRecordAfter: Record<string, string[]>
}

let fixtureRun: Promise<Captured> | undefined

/** Memoized: every assertion reads the same snapshot. */
function runMigrationOverFixture(): Promise<Captured> {
  fixtureRun ??= executeMigrationOverFixture()
  return fixtureRun
}

async function executeMigrationOverFixture(): Promise<Captured> {
  let captured: Captured | undefined
  const statements = migrationStatements()
  const schema = statements.filter(statement => statement.startsWith('ALTER TABLE'))
  const moves = statements.filter(statement => !statement.startsWith('ALTER TABLE'))

  try {
    await testDb.$transaction(
      async tx => {
        // The column first, so the fixture can write record seats on a database the migration has not reached.
        for (const statement of schema) await tx.$executeRawUnsafe(statement)

        const stamp = `givenroles-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const cong = await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })
        const congregationId = cong.id
        const role = (key: string, extra: { isBuiltIn?: boolean; isSinglePerson?: boolean } = {}) =>
          tx.role.create({
            data: { key: `${stamp}-${key}`, name: key, isBuiltIn: extra.isBuiltIn ?? false, congregationId, ...extra },
          })
        // `admin` and `elder` by their real keys: the migration recognises the system role by key.
        const admin = await tx.role.create({ data: { key: 'admin', name: null, isBuiltIn: true, congregationId } })
        const elder = await tx.role.create({ data: { key: 'elder', name: null, isBuiltIn: true, congregationId } })
        const sono = await role('sono')
        const comptes = await role('comptes', { isSinglePerson: true })
        const lecteurs = await role('lecteurs')

        const member = (firstname: string) =>
          tx.member.create({ data: { firstname, lastname: 'TEST', congregationId } })
        const account = (tag: string, memberId: number | null) =>
          tx.userAccount.create({
            data: { email: `${stamp}-${tag}@test.invalid`, password: 'hashed', active: true, congregationId, memberId },
          })
        const onLogin = (userId: number, roleId: number, kind = 'member') =>
          tx.userRoleAssignment.create({ data: { userId, roleId, congregationId, kind } })
        const onRecord = (memberId: number, roleId: number, kind = 'member') =>
          tx.memberRoleAssignment.create({ data: { memberId, roleId, congregationId, kind } })

        // A publisher with a login: a team, a personal role he holds, admin, and an identity role on the record.
        const anna = await member('Anna')
        const annaLogin = await account('anna', anna.id)
        await onLogin(annaLogin.id, sono.id)
        await onLogin(annaLogin.id, comptes.id, 'leader')
        await onLogin(annaLogin.id, admin.id)
        await onRecord(anna.id, elder.id)

        // A login with no record (a circuit overseer): nowhere to move to, so its roles stay.
        const visitor = await account('visitor', null)
        await onLogin(visitor.id, sono.id, 'deputy')

        // The record already holds the role as a plain member while the login holds it as leader: the higher seat wins.
        const bruno = await member('Bruno')
        const brunoLogin = await account('bruno', bruno.id)
        await onRecord(bruno.id, lecteurs.id)
        await onLogin(brunoLogin.id, lecteurs.id, 'leader')

        // No login at all, nothing given: must come out empty.
        const carl = await member('Carl')

        const people: Person[] = [
          { label: 'anna', memberId: anna.id, userId: annaLogin.id },
          { label: 'visitor', memberId: null, userId: visitor.id },
          { label: 'bruno', memberId: bruno.id, userId: brunoLogin.id },
          { label: 'carl', memberId: carl.id, userId: null },
        ]
        const snapshot = async () =>
          Object.fromEntries(
            await Promise.all(people.map(async p => [p.label, await seatsOf(tx, p.memberId, p.userId)] as const)),
          )
        const strip = (seats: Record<string, string[]>) =>
          Object.fromEntries(Object.entries(seats).map(([k, v]) => [k, v.map(s => s.replace(`${stamp}-`, '')).sort()]))

        const before = strip(await snapshot())
        for (const statement of moves) await tx.$executeRawUnsafe(statement)
        const after = strip(await snapshot())
        for (const statement of moves) await tx.$executeRawUnsafe(statement)
        const afterSecondRun = strip(await snapshot())

        const loginSeats = async (p: Person) => (p.userId == null ? [] : await seatsOf(tx, null, p.userId))
        const recordSeats = async (p: Person) => (p.memberId == null ? [] : await seatsOf(tx, p.memberId, null))
        const onLoginAfter = strip(
          Object.fromEntries(await Promise.all(people.map(async p => [p.label, await loginSeats(p)] as const))),
        )
        const onRecordAfter = strip(
          Object.fromEntries(await Promise.all(people.map(async p => [p.label, await recordSeats(p)] as const))),
        )

        captured = { before, after, afterSecondRun, onLoginAfter, onRecordAfter }
        throw new Rollback()
      },
      { timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  if (!captured) throw new Error('fixture did not capture')
  return captured
}

describe('migration: move given roles onto the record', () => {
  it('pins the record’s seat to the three words the application writes', () => {
    const sql = migrationStatements().join(';')
    expect(sql).toContain(`CHECK ("kind" IN ('leader', 'deputy', 'member'))`)
  })

  it('builds a fixture with seats on the login to move', async () => {
    const { before } = await runMigrationOverFixture()
    expect(before.anna).toEqual(['admin:member', 'comptes:leader', 'elder:member', 'sono:member'])
  })

  it('moves a linked login’s given roles onto the record, seats included', async () => {
    const { onRecordAfter } = await runMigrationOverFixture()
    expect(onRecordAfter.anna).toEqual(['comptes:leader', 'elder:member', 'sono:member'])
  })

  it('leaves admin on the login', async () => {
    const { onLoginAfter } = await runMigrationOverFixture()
    expect(onLoginAfter.anna).toEqual(['admin:member'])
  })

  it('leaves the roles of a login without a record where they are', async () => {
    const { onLoginAfter } = await runMigrationOverFixture()
    expect(onLoginAfter.visitor).toEqual(['sono:deputy'])
  })

  it('keeps the higher seat when the record already holds the role', async () => {
    const { onRecordAfter, onLoginAfter } = await runMigrationOverFixture()
    expect(onRecordAfter.bruno).toEqual(['lecteurs:leader'])
    expect(onLoginAfter.bruno).toEqual([])
  })

  it('changes nobody’s roles or seats, except the seat a duplicate raised', async () => {
    const { before, after } = await runMigrationOverFixture()
    expect(after.anna).toEqual(before.anna)
    expect(after.visitor).toEqual(before.visitor)
    expect(after.carl).toEqual([])
    expect(after.bruno).toEqual(['lecteurs:leader'])
  })

  it('does nothing more when run twice', async () => {
    const { after, afterSecondRun } = await runMigrationOverFixture()
    expect(afterSecondRun).toEqual(after)
  })
})
