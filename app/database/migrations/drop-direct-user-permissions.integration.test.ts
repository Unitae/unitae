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
 * The table as it stood before this migration dropped it, reduced to the three
 * columns the migration actually reads.
 *
 * CI runs `prisma migrate deploy` before this suite, so by the time the test
 * executes the real table is already gone and there would be no "before" to
 * migrate. `IF NOT EXISTS` makes this a no-op on a development database where
 * the migration has not been applied yet, so the test behaves the same in both.
 *
 * Deliberately without foreign keys: they are irrelevant to what is under test
 * and would make any drop of this table take ACCESS EXCLUSIVE on `UserAccount`,
 * `Permission` and `Congregation`.
 */
const RECREATE_DROPPED_TABLE = `
  CREATE TABLE IF NOT EXISTS "CongregationUserPermission" (
    "id"             SERIAL PRIMARY KEY,
    "userId"         INTEGER NOT NULL,
    "permissionId"   INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL
  )
`

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
 * The drop is withheld deliberately. On a development database the table still
 * carries its foreign keys, so dropping it takes ACCESS EXCLUSIVE on
 * `UserAccount`, `Permission` and `Congregation` too, and this fixture holds
 * that until it rolls back. Integration files run in parallel against one
 * database, so executing it deadlocked unrelated suites at random.
 *
 * Withholding it costs nothing in coverage: the backfill above is the part that
 * can be wrong, and `drops the direct-grant table` below still pins that the
 * statement ships.
 */
function backfillStatements(): string[] {
  return migrationStatements().filter(statement => !statement.startsWith(DROP_STATEMENT))
}

/**
 * Permission keys this migration operated on, ensured before the fixture runs.
 *
 * They predate the capability rename, so `seedPermissions` no longer creates them and a
 * freshly seeded database has none. Ensured OUTSIDE the fixture transaction on purpose:
 * upserting a globally-unique key inside a long transaction that then rolls back makes
 * parallel integration files block on each other.
 */
const LEGACY_PERMISSION_KEYS = ['admin', 'board-validator', 'program-viewer', 'territories-manager']

async function ensureLegacyPermissions(): Promise<Map<string, number>> {
  const ids = new Map<string, number>()
  for (const key of LEGACY_PERMISSION_KEYS) {
    // Raw INSERT ... ON CONFLICT DO NOTHING, not `upsert`: Prisma's upsert is a
    // find-then-create, so several migration files starting at once on a fresh database
    // all miss, all insert, and all but one fail on the unique key. This is atomic.
    await testDb.$executeRaw`INSERT INTO "Permission" ("key") VALUES (${key}) ON CONFLICT ("key") DO NOTHING`
    const row = await testDb.permission.findUniqueOrThrow({ where: { key }, select: { id: true } })
    ids.set(key, row.id)
  }
  return ids
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
  /** The permission key deliberately left out of the migration's mapping table. */
  unmappedPermissionKey: string
  /** Row counts after one backfill, and after running it a second time. */
  countsAfterFirstRun: Record<string, number>
  countsAfterSecondRun: Record<string, number>
}

let fixtureRun: Promise<Captured> | undefined

/** Memoized: the fixture is expensive and every assertion reads the same snapshot. */
function runMigrationOverFixture(): Promise<Captured> {
  fixtureRun ??= executeMigrationOverFixture()
  return fixtureRun
}

async function executeMigrationOverFixture(): Promise<Captured> {
  let captured: Captured | undefined
  const legacyIds = await ensureLegacyPermissions()

  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `dropdirect-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`

        const permissionId = async (key: string) => {
          const id = legacyIds.get(key)
          if (id == null) throw new Error(`Legacy permission "${key}" was not ensured for this fixture`)
          return id
        }
        const [adminPid, territoriesPid, programPid, boardValidatorPid] = await Promise.all([
          permissionId('admin'),
          permissionId('territories-manager'),
          permissionId('program-viewer'),
          permissionId('board-validator'),
        ])

        await tx.$executeRawUnsafe(RECREATE_DROPPED_TABLE)

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

        // A permission the mapping table has never heard of. Reachable if a
        // permission ships between this migration being written and being run.
        // Its grants must survive anyway — the table is about to be dropped, so
        // anything not carried across is lost for good.
        const unmappedKey = `${stamp}-unmapped`
        const unmapped = await tx.permission.create({ data: { key: unmappedKey }, select: { id: true } })
        const aUnmapped = await account(congA.id, 'a-unmapped')
        await directGrant(aUnmapped.id, unmapped.id, congA.id)

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
          { label: 'a-unmapped', id: aUnmapped.id, congregationId: congA.id },
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

        const countRows = async (): Promise<Record<string, number>> => ({
          roles: await tx.role.count({ where: { congregationId: { in: [congA.id, congB.id] } } }),
          rolePermissions: await tx.rolePermission.count({ where: { congregationId: { in: [congA.id, congB.id] } } }),
          assignments: await tx.userRoleAssignment.count({ where: { congregationId: { in: [congA.id, congB.id] } } }),
          auditRows: await tx.auditLog.count({ where: { congregationId: { in: [congA.id, congB.id] } } }),
        })

        const countsAfterFirstRun = await countRows()

        // The file claims to be re-runnable (every INSERT is ON CONFLICT DO
        // NOTHING). A deploy that retries would otherwise duplicate roles and
        // double-count the audit metadata.
        for (const statement of backfillStatements()) {
          await tx.$executeRawUnsafe(statement)
        }
        const countsAfterSecondRun = await countRows()

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
          unmappedPermissionKey: unmappedKey,
          countsAfterFirstRun,
          countsAfterSecondRun,
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

    // A permission missing from the mapping table still has to survive: the
    // grant table is dropped, so a skipped row is permanently lost access.
    const unmapped = result.accounts.find(a => a.label === 'a-unmapped')
    expect(unmapped?.after).toEqual([result.unmappedPermissionKey])
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

  it('is re-runnable without duplicating anything', async () => {
    const result = await runMigrationOverFixture()

    expect(result.countsAfterSecondRun).toEqual(result.countsAfterFirstRun)
    // Guard against the comparison passing on two empty snapshots.
    expect(result.countsAfterFirstRun.roles).toBeGreaterThan(0)
    expect(result.countsAfterFirstRun.assignments).toBeGreaterThan(0)
  })

  it('drops the direct-grant table', () => {
    // Asserted against the shipped SQL rather than executed — see
    // `backfillStatements` for why the drop is withheld from the fixture.
    const statements = migrationStatements()
    expect(statements.at(-1)).toBe(DROP_STATEMENT)
  })
})
