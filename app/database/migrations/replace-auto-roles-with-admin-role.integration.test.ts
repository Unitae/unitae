import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the
// schema owner, and this one creates a temp table.
const adapter = new PrismaPg({
  connectionString: process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const MIGRATION_SQL = resolve(import.meta.dirname, '20260826120000_replace_auto_roles_with_admin_role', 'migration.sql')

/**
 * The real migration file, split into statements.
 *
 * Reading the shipped artifact rather than a paraphrase is the point: a test
 * that re-typed the SQL would keep passing after someone edited the file.
 *
 * Nothing is withheld here, unlike the sibling test for
 * 20260826000000_drop_direct_user_permissions. This migration drops only its own
 * TEMP table, which takes no lock on anything another suite touches.
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
 * The permission set an account effectively holds: everything its account-bound
 * and member-bound roles grant.
 *
 * Deliberately re-derived here rather than calling `resolveEffectivePermissions`,
 * which binds to its own module-level client and so cannot see this transaction's
 * uncommitted fixture. Note this does not model the `admin ⇒ everything` expansion
 * that resolveEffectivePermissions applies — assertions below check for the `admin`
 * key itself, which is the thing the migration is responsible for carrying across.
 */
async function effective(tx: Tx, userId: number, congregationId: number): Promise<string[]> {
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

async function roleKeys(tx: Tx, congregationId: number): Promise<string[]> {
  const rows = await tx.role.findMany({ where: { congregationId }, select: { key: true } })
  return rows.map(r => r.key).sort()
}

interface Captured {
  adminBefore: string[]
  adminAfter: string[]
  /** The deliberate revocation: a user who held a permission only via a non-admin auto-role. */
  territoriesOnlyBefore: string[]
  territoriesOnlyAfter: string[]
  /** A two-permission role keyed like an auto-role — an admin's own work, must survive. */
  survivingBundleKeys: string[]
  /** A one-permission role whose key does not match the permission it grants. */
  mismatchedRoleSurvives: boolean
  rolesInAAfter: string[]
  adminRoleIsBuiltIn: boolean | null
  /** Congregation B already owns a role keyed `admin`; the migration must not widen it. */
  bPreexistingAdminPermissions: string[]
  bCanDoAnythingSurvives: boolean
  /** Congregation C has nothing to migrate. */
  rolesInCAfter: string[]
  cAuditRows: number
  auditMetadataA: string | null
  territoryKindRuleRemoved: boolean
  servicePartRuleRemoved: boolean
  bCollisionAuditRows: number
  aCollisionAuditRows: number
  cascadingRoleTables: string[]
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
        const stamp = `autorole-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`

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

        const congA = await tx.congregation.create({ data: { name: `${stamp}-a`, slug: `${stamp}-a`, active: true } })
        const congB = await tx.congregation.create({ data: { name: `${stamp}-b`, slug: `${stamp}-b`, active: true } })
        const congC = await tx.congregation.create({ data: { name: `${stamp}-c`, slug: `${stamp}-c`, active: true } })

        const account = (congregationId: number, tag: string) =>
          tx.userAccount.create({
            data: { email: `${stamp}-${tag}@test.invalid`, password: 'hashed', active: true, congregationId },
          })

        /** A role of exactly the shape 20260826000000 minted: one key, one matching permission. */
        const autoRole = async (congregationId: number, key: string, pid: number) => {
          const role = await tx.role.create({ data: { key, isBuiltIn: false, congregationId } })
          await tx.rolePermission.create({ data: { roleId: role.id, permissionId: pid, congregationId } })
          return role
        }

        // --- Congregation A: the ordinary case --------------------------
        const aAdmin = await account(congA.id, 'a-admin')
        const aAdminRole = await autoRole(congA.id, 'can-do-anything', adminPid)
        await tx.userRoleAssignment.create({
          data: { userId: aAdmin.id, roleId: aAdminRole.id, congregationId: congA.id },
        })

        // Reaches territories-manager ONLY through an auto-role. This is the access the
        // migration deliberately drops — asserted below so the revocation stays a
        // recorded decision rather than something a future reader mistakes for a bug.
        const aTerritories = await account(congA.id, 'a-territories')
        const aTerritoriesRole = await autoRole(congA.id, 'can-edit-territories', territoriesPid)
        await tx.userRoleAssignment.create({
          data: { userId: aTerritories.id, roleId: aTerritoriesRole.id, congregationId: congA.id },
        })

        // An eligibility rule naming that auto-role. Deleting the role cascades to it;
        // the migration counts it into the audit row so the loss is visible.
        const kind = await tx.territoryKind.create({
          data: { key: `${stamp}-kind`, isBuiltIn: false, congregationId: congA.id },
        })
        await tx.territoryKindAllowedRole.create({
          data: { kindId: kind.id, roleId: aTerritoriesRole.id, congregationId: congA.id },
        })

        // A second eligibility rule, on a different cascade path. The audit count once
        // covered only four of the six tables with a cascading Role FK, so the
        // service-part tables were deleted without ever being counted.
        const template = await tx.eventTemplate.create({
          data: { name: 'Réunion', key: `${stamp}-tpl`, congregationId: congA.id },
        })
        const servicePart = await tx.templateServicePart.create({
          data: { name: 'Accueil', key: `${stamp}-sp`, templateId: template.id, congregationId: congA.id },
        })
        await tx.templateServicePartAllowedRole.create({
          data: { servicePartId: servicePart.id, roleId: aTerritoriesRole.id, congregationId: congA.id },
        })

        // A role an admin has since extended to two permissions. Keyed like an auto-role,
        // but no longer one — the shape test must spare it.
        const bundle = await tx.role.create({
          data: { key: 'can-view-programs', name: 'Programme + estrade', isBuiltIn: false, congregationId: congA.id },
        })
        await tx.rolePermission.createMany({
          data: [
            { roleId: bundle.id, permissionId: programPid, congregationId: congA.id },
            { roleId: bundle.id, permissionId: boardValidatorPid, congregationId: congA.id },
          ],
        })

        // One permission, but not the one its key was minted from: an admin's own role
        // that merely collides on name. Must survive.
        await autoRole(congA.id, 'can-view-absences', boardValidatorPid)

        // --- Congregation B: `admin` key already taken -------------------
        // A custom role an admin created and called "admin". Adopting it would grant
        // Permission.Admin to everyone already assigned — the migration must refuse,
        // and must then leave can-do-anything in place rather than stranding its holders.
        const bCustomAdmin = await tx.role.create({
          data: { key: 'admin', name: 'Admin réunion', isBuiltIn: false, congregationId: congB.id },
        })
        await tx.rolePermission.create({
          data: { roleId: bCustomAdmin.id, permissionId: programPid, congregationId: congB.id },
        })
        const bAdmin = await account(congB.id, 'b-admin')
        const bAutoAdmin = await autoRole(congB.id, 'can-do-anything', adminPid)
        await tx.userRoleAssignment.create({
          data: { userId: bAdmin.id, roleId: bAutoAdmin.id, congregationId: congB.id },
        })

        // --- Congregation C: nothing to migrate --------------------------
        await account(congC.id, 'c-none')

        const adminBefore = await effective(tx, aAdmin.id, congA.id)
        const territoriesOnlyBefore = await effective(tx, aTerritories.id, congA.id)

        const statements = migrationStatements()
        for (const statement of statements) {
          await tx.$executeRawUnsafe(statement)
        }

        const countRows = async (): Promise<Record<string, number>> => ({
          roles: await tx.role.count({ where: { congregationId: { in: [congA.id, congB.id, congC.id] } } }),
          rolePermissions: await tx.rolePermission.count({
            where: { congregationId: { in: [congA.id, congB.id, congC.id] } },
          }),
          userAssignments: await tx.userRoleAssignment.count({
            where: { congregationId: { in: [congA.id, congB.id, congC.id] } },
          }),
          audit: await tx.auditLog.count({
            where: {
              congregationId: { in: [congA.id, congB.id, congC.id] },
              action: 'permission.auto_roles_removed',
            },
          }),
        })

        const countsAfterFirstRun = await countRows()

        const adminRole = await tx.role.findFirst({
          where: { congregationId: congA.id, key: 'admin' },
          select: { isBuiltIn: true },
        })

        const auditA = await tx.auditLog.findFirst({
          where: { congregationId: congA.id, action: 'permission.auto_roles_removed' },
          select: { metadata: true },
        })

        const bAdminRolePerms = await tx.rolePermission.findMany({
          where: { roleId: bCustomAdmin.id },
          select: { permission: { select: { key: true } } },
        })

        captured = {
          adminBefore,
          adminAfter: await effective(tx, aAdmin.id, congA.id),
          territoriesOnlyBefore,
          territoriesOnlyAfter: await effective(tx, aTerritories.id, congA.id),
          survivingBundleKeys: (
            await tx.rolePermission.findMany({
              where: { roleId: bundle.id },
              select: { permission: { select: { key: true } } },
            })
          )
            .map(r => r.permission.key)
            .sort(),
          mismatchedRoleSurvives:
            (await tx.role.count({ where: { congregationId: congA.id, key: 'can-view-absences' } })) === 1,
          rolesInAAfter: await roleKeys(tx, congA.id),
          adminRoleIsBuiltIn: adminRole?.isBuiltIn ?? null,
          bPreexistingAdminPermissions: bAdminRolePerms.map(r => r.permission.key).sort(),
          bCanDoAnythingSurvives:
            (await tx.role.count({ where: { congregationId: congB.id, key: 'can-do-anything' } })) === 1,
          rolesInCAfter: await roleKeys(tx, congC.id),
          cAuditRows: await tx.auditLog.count({
            where: { congregationId: congC.id, action: 'permission.auto_roles_removed' },
          }),
          auditMetadataA: auditA?.metadata ?? null,
          territoryKindRuleRemoved: (await tx.territoryKindAllowedRole.count({ where: { kindId: kind.id } })) === 0,
          servicePartRuleRemoved:
            (await tx.templateServicePartAllowedRole.count({ where: { servicePartId: servicePart.id } })) === 0,
          bCollisionAuditRows: await tx.auditLog.count({
            where: { congregationId: congB.id, action: 'permission.admin_role_key_taken' },
          }),
          aCollisionAuditRows: await tx.auditLog.count({
            where: { congregationId: congA.id, action: 'permission.admin_role_key_taken' },
          }),
          cascadingRoleTables: (
            await tx.$queryRaw<{ table_name: string }[]>`
              SELECT DISTINCT tc.table_name
              FROM information_schema.table_constraints tc
              JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
              JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
              WHERE tc.constraint_type = 'FOREIGN KEY'
                AND ccu.table_name = 'Role'
                AND rc.delete_rule = 'CASCADE'
            `
          )
            .map(r => r.table_name)
            .sort(),
          countsAfterFirstRun,
          countsAfterSecondRun: await (async () => {
            for (const statement of statements) {
              await tx.$executeRawUnsafe(statement)
            }
            return countRows()
          })(),
        }

        throw new Rollback()
      },
      { timeout: 60_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }

  if (!captured) throw new Error('fixture did not capture')
  return captured
}

describe('20260826120000_replace_auto_roles_with_admin_role', () => {
  it('keeps admin access, carried from can-do-anything onto the admin role', async () => {
    const c = await runMigrationOverFixture()

    // Sanity-pin the fixture: a before/after equality check passes just as happily
    // on two empty sets.
    expect(c.adminBefore).toEqual(['admin'])
    expect(c.adminAfter).toEqual(['admin'])
  })

  it('creates admin as an undeletable system role', async () => {
    const c = await runMigrationOverFixture()
    expect(c.adminRoleIsBuiltIn).toBe(true)
  })

  it('revokes access that existed only through a non-admin auto-role', async () => {
    const c = await runMigrationOverFixture()

    // Deliberate. One role per permission is not a role model, and no live congregation
    // had run the migration that created these. If this assertion ever fails because
    // someone "fixed" the revocation, read the migration header before changing it back.
    expect(c.territoriesOnlyBefore).toEqual(['territories-manager'])
    expect(c.territoriesOnlyAfter).toEqual([])
  })

  it('deletes the eligibility rules that named a removed role, and counts them', async () => {
    const c = await runMigrationOverFixture()

    expect(c.territoryKindRuleRemoved).toBe(true)
    expect(c.servicePartRuleRemoved).toBe(true)
    expect(c.auditMetadataA).not.toBeNull()
    const metadata = JSON.parse(c.auditMetadataA as string)
    // Both rules, on two different cascade paths. An undercount here is worse than no
    // count at all: the row reads as an authoritative total of what was destroyed.
    expect(metadata.eligibilityRulesRemoved).toBe(2)
    expect(metadata.userAssignmentsRevoked).toBe(1)
  })

  it('counts every table that cascades from Role, so a new one cannot be missed', async () => {
    const c = await runMigrationOverFixture()

    // Read from the live catalog rather than a hardcoded list: the audit undercount this
    // guards against was introduced by adding eligibility tables over time and updating
    // only some of the subqueries. A new cascading table now fails here immediately.
    const eligibilityTables = c.cascadingRoleTables.filter(
      t => !['RolePermission', 'UserRoleAssignment', 'MemberRoleAssignment'].includes(t),
    )
    const sql = readFileSync(MIGRATION_SQL, 'utf8')
    const uncounted = eligibilityTables.filter(t => !sql.includes(`"${t}"`))
    expect(uncounted).toEqual([])
  })

  it('records a trail when the admin key was already taken', async () => {
    const c = await runMigrationOverFixture()

    // Congregation B kept its old shape. That is the safe outcome, but it must not be
    // silent — nothing else would ever reveal it.
    expect(c.bCollisionAuditRows).toBe(1)
    // Congregation A migrated cleanly, so it gets no such row.
    expect(c.aCollisionAuditRows).toBe(0)
  })

  it('spares a role that only looks like an auto-role', async () => {
    const c = await runMigrationOverFixture()

    // Two permissions: an admin extended it, so it is theirs now.
    expect(c.survivingBundleKeys).toEqual(['board-validator', 'program-viewer'])
    // One permission, but not the one the key was minted from.
    expect(c.mismatchedRoleSurvives).toBe(true)
    expect(c.rolesInAAfter).toEqual(['admin', 'can-view-absences', 'can-view-programs'])
  })

  it('refuses to adopt a pre-existing role keyed admin, and strands nobody', async () => {
    const c = await runMigrationOverFixture()

    // Adopting it would have granted Permission.Admin to everyone already assigned.
    expect(c.bPreexistingAdminPermissions).toEqual(['program-viewer'])
    // And because the target could not be created, can-do-anything stays put rather
    // than taking its holders' admin access down with it.
    expect(c.bCanDoAnythingSurvives).toBe(true)
  })

  it('seeds admin into a congregation with nothing to migrate, without an audit row', async () => {
    const c = await runMigrationOverFixture()

    expect(c.rolesInCAfter).toEqual(['admin'])
    expect(c.cAuditRows).toBe(0)
  })

  it('is idempotent', async () => {
    const c = await runMigrationOverFixture()

    // Catches the collision-logic class of bug: a second run seeing its own output,
    // taking it for a clash and forking. Includes the audit count, which has no unique
    // key and so relies on an explicit WHERE NOT EXISTS guard.
    expect(c.countsAfterSecondRun).toEqual(c.countsAfterFirstRun)
  })
})
