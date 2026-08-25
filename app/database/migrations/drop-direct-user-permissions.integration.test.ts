import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the
// schema owner, and this one drops a table, which the RLS-bound runtime role
// cannot do.
const adapter = new PrismaPg({
  connectionString: process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const MIGRATION_SQL = resolve(import.meta.dirname, '20260826000000_drop_direct_user_permissions', 'migration.sql')

const DROP_STATEMENT = 'DROP TABLE "CongregationUserPermission"'

/**
 * The real migration file, split into statements.
 *
 * Reading the shipped artifact rather than a paraphrase is the point: a test
 * that re-typed the SQL would keep passing after someone edited the file.
 */
function migrationStatements(): string[] {
  return readFileSync(MIGRATION_SQL, 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0)
}

/**
 * Everything the migration does except the final `DROP TABLE`.
 *
 * The drop is withheld deliberately. Dropping a table takes ACCESS EXCLUSIVE not
 * only on it but on every table its foreign keys reference — `UserAccount`,
 * `Permission`, `Congregation` — and this fixture holds that lock until it rolls
 * back. Integration files run in parallel against one database, so executing it
 * here deadlocks unrelated suites at random.
 *
 * Withholding it costs nothing in coverage: the backfill above is the part that
 * can be wrong, and `drops the direct-grant table` below still pins that the
 * statement ships.
 */
function backfillStatements(): string[] {
  return migrationStatements().filter(statement => !statement.startsWith(DROP_STATEMENT))
}

/** Thrown to roll the fixture back; every assertion runs on captured values. */
class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

type Tx = Parameters<Parameters<typeof testDb.$transaction>[0]>[0]

/**
 * The permission set an account effectively holds, under the pre-migration
 * rule: direct grants unioned with everything its account-bound and
 * member-bound roles grant.
 *
 * Deliberately re-derived here from the three tables rather than calling
 * `resolveEffectivePermissions`, which binds to its own module-level client
 * and so cannot see this transaction's uncommitted fixture.
 */
async function effectiveBefore(tx: Tx, userId: number, congregationId: number): Promise<string[]> {
  const direct = await tx.$queryRaw<{ key: string }[]>`
    SELECT p."key" FROM "CongregationUserPermission" cup
    JOIN "Permission" p ON p."id" = cup."permissionId"
    WHERE cup."userId" = ${userId} AND cup."congregationId" = ${congregationId}
  `
  return [...new Set([...direct.map(r => r.key), ...(await effectiveAfter(tx, userId, congregationId))])].sort()
}

/** The same question under the post-migration rule: roles only. */
async function effectiveAfter(tx: Tx, userId: number, congregationId: number): Promise<string[]> {
  const rows = await tx.rolePermission.findMany({
    where: {
      congregationId,
      role: {
        OR: [
          { members: { some: { userId } } },
          { memberAssignments: { some: { member: { account: { id: userId } } } } },
        ],
      },
    },
    select: { permission: { select: { key: true } } },
  })
  return [...new Set(rows.map(r => r.permission.key))].sort()
}

interface AccountSnapshot {
  label: string
  before: string[]
  after: string[]
}

interface Captured {
  accounts: AccountSnapshot[]
  auditActions: string[]
  auditCongregationIds: number[]
  /** Permission keys still granted by congregation B's pre-existing `can-do-anything` role. */
  collidingRoleGrants: string[]
  /** Keys of the roles the migration created in congregation B. */
  createdRoleKeysInB: string[]
}

let fixtureRun: Promise<Captured> | undefined

/** Memoized: the fixture is expensive and every assertion reads the same snapshot. */
function runMigrationOverFixture(): Promise<Captured> {
  fixtureRun ??= executeMigrationOverFixture()
  return fixtureRun
}

async function executeMigrationOverFixture(): Promise<Captured> {
  let captured: Captured | undefined

  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `dropdirect-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`

        const permissionId = async (key: string) => {
          const row = await tx.permission.findUnique({ where: { key }, select: { id: true } })
          if (!row) throw new Error(`Permission "${key}" is not seeded in this database`)
          return row.id
        }
        const [adminPid, territoriesPid, programPid, boardValidatorPid] = await Promise.all([
          permissionId('admin'),
          permissionId('territories-manager'),
          permissionId('program-viewer'),
          permissionId('board-validator'),
        ])

        const congA = await tx.congregation.create({ data: { name: `${stamp}-a`, slug: `${stamp}-a`, active: true } })
        const congB = await tx.congregation.create({ data: { name: `${stamp}-b`, slug: `${stamp}-b`, active: true } })

        const account = async (congregationId: number, tag: string) =>
          tx.userAccount.create({
            data: { email: `${stamp}-${tag}@test.invalid`, password: 'hashed', active: true, congregationId },
          })

        const directGrant = (userId: number, pid: number, congregationId: number) =>
          tx.$executeRaw`
            INSERT INTO "CongregationUserPermission" ("userId", "permissionId", "congregationId")
            VALUES (${userId}, ${pid}, ${congregationId})
          `

        // --- Congregation A ---------------------------------------------
        // Admin held only as a direct grant: the case the whole migration exists for.
        const aAdmin = await account(congA.id, 'a-admin')
        await directGrant(aAdmin.id, adminPid, congA.id)

        // Holds territories-manager BOTH directly and through a role. The
        // migration must not double-create, and the set must not change.
        const aMixed = await account(congA.id, 'a-mixed')
        const aRole = await tx.role.create({
          data: { key: `${stamp}-existing`, name: 'Déjà en place', isBuiltIn: false, congregationId: congA.id },
        })
        await tx.rolePermission.createMany({
          data: [
            { roleId: aRole.id, permissionId: territoriesPid, congregationId: congA.id },
            { roleId: aRole.id, permissionId: programPid, congregationId: congA.id },
          ],
        })
        await tx.userRoleAssignment.create({ data: { userId: aMixed.id, roleId: aRole.id, congregationId: congA.id } })
        await directGrant(aMixed.id, territoriesPid, congA.id)

        // Permission arrives through the linked Member's role. Nothing here is
        // a direct grant, so the migration must leave it completely alone.
        const aViaMember = await account(congA.id, 'a-member')
        const member = await tx.member.create({
          data: { firstname: 'Marc', lastname: 'Dupont', congregationId: congA.id },
        })
        await tx.userAccount.update({ where: { id: aViaMember.id }, data: { memberId: member.id } })
        const memberRole = await tx.role.create({
          data: { key: `${stamp}-member-role`, name: 'Rôle membre', isBuiltIn: false, congregationId: congA.id },
        })
        await tx.rolePermission.create({
          data: { roleId: memberRole.id, permissionId: boardValidatorPid, congregationId: congA.id },
        })
        await tx.memberRoleAssignment.create({
          data: { memberId: member.id, roleId: memberRole.id, congregationId: congA.id },
        })

        // No grants at all — must stay empty, and must not get an audit row.
        const aNone = await account(congA.id, 'a-none')

        // --- Congregation B: key collision ------------------------------
        // This congregation already owns a role slugified to `can-do-anything`
        // that grants only program-viewer. Reusing it would silently hand
        // admin to everyone already assigned to it.
        const bExisting = await tx.role.create({
          data: { key: 'can-do-anything', name: 'Peut tout faire', isBuiltIn: false, congregationId: congB.id },
        })
        await tx.rolePermission.create({
          data: { roleId: bExisting.id, permissionId: programPid, congregationId: congB.id },
        })
        const bBystander = await account(congB.id, 'b-bystander')
        await tx.userRoleAssignment.create({
          data: { userId: bBystander.id, roleId: bExisting.id, congregationId: congB.id },
        })

        const bAdmin = await account(congB.id, 'b-admin')
        await directGrant(bAdmin.id, adminPid, congB.id)

        const subjects: { label: string; id: number; congregationId: number }[] = [
          { label: 'a-admin', id: aAdmin.id, congregationId: congA.id },
          { label: 'a-mixed', id: aMixed.id, congregationId: congA.id },
          { label: 'a-member', id: aViaMember.id, congregationId: congA.id },
          { label: 'a-none', id: aNone.id, congregationId: congA.id },
          { label: 'b-bystander', id: bBystander.id, congregationId: congB.id },
          { label: 'b-admin', id: bAdmin.id, congregationId: congB.id },
        ]

        const before = new Map<string, string[]>()
        for (const s of subjects) before.set(s.label, await effectiveBefore(tx, s.id, s.congregationId))

        for (const statement of backfillStatements()) {
          await tx.$executeRawUnsafe(statement)
        }

        const accounts: AccountSnapshot[] = []
        for (const s of subjects) {
          accounts.push({
            label: s.label,
            before: before.get(s.label) ?? [],
            after: await effectiveAfter(tx, s.id, s.congregationId),
          })
        }

        const auditRows = await tx.auditLog.findMany({
          where: { congregationId: { in: [congA.id, congB.id] } },
          select: { action: true, congregationId: true },
        })

        const rolesInB = await tx.role.findMany({
          where: { congregationId: congB.id, isBuiltIn: false },
          select: { key: true },
        })

        const collidingGrants = await tx.rolePermission.findMany({
          where: { roleId: bExisting.id },
          select: { permission: { select: { key: true } } },
        })

        captured = {
          accounts,
          auditActions: auditRows.map(r => r.action),
          auditCongregationIds: auditRows.map(r => r.congregationId).sort((a, b) => a - b),
          collidingRoleGrants: collidingGrants.map(g => g.permission.key).sort(),
          createdRoleKeysInB: rolesInB.map(r => r.key).sort(),
        }

        // Everything above unwinds here.
        throw new Rollback()
      },
      { timeout: 25_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }

  if (!captured) throw new Error('fixture never ran')
  return captured
}

describe('20260826000000_drop_direct_user_permissions', () => {
  it('leaves every account with exactly the permissions it had before', async () => {
    const result = await runMigrationOverFixture()

    // The acceptance criterion of the whole change. Asserted per account so a
    // failure names which one drifted rather than just "sets differ".
    for (const account of result.accounts) {
      expect(`${account.label}: ${account.after.join(',')}`).toBe(`${account.label}: ${account.before.join(',')}`)
    }

    // Sanity: the fixture actually exercised something. Without this the loop
    // above passes just as happily against six empty sets.
    const admin = result.accounts.find(a => a.label === 'a-admin')
    expect(admin?.after).toEqual(['admin'])
    const mixed = result.accounts.find(a => a.label === 'a-mixed')
    expect(mixed?.after).toEqual(['program-viewer', 'territories-manager'])
    const viaMember = result.accounts.find(a => a.label === 'a-member')
    expect(viaMember?.after).toEqual(['board-validator'])
    expect(result.accounts.find(a => a.label === 'a-none')?.after).toEqual([])
  })

  it('never widens a role a congregation already owned under the auto-role key', async () => {
    const result = await runMigrationOverFixture()

    // Congregation B's own `can-do-anything` must still grant program-viewer
    // and nothing else — in particular not admin.
    expect(result.collidingRoleGrants).toEqual(['program-viewer'])
    // ...and the admin grant landed on a distinct, suffixed role instead.
    expect(result.createdRoleKeysInB).toEqual(['can-do-anything', 'can-do-anything-migrated'])
  })

  it('records one bulk audit event per migrated congregation', async () => {
    const result = await runMigrationOverFixture()

    expect(result.auditActions).toEqual(['permission.direct_grants_migrated', 'permission.direct_grants_migrated'])
    expect(new Set(result.auditCongregationIds).size).toBe(2)
  })

  it('drops the direct-grant table', () => {
    // Asserted against the shipped SQL rather than executed — see
    // `backfillStatements` for why the drop is withheld from the fixture.
    const statements = migrationStatements()
    expect(statements.at(-1)).toBe(DROP_STATEMENT)
  })
})
