import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the
// schema owner.
const adapter = new PrismaPg({
  connectionString: process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const MIGRATION_SQL = resolve(import.meta.dirname, '20260827000000_add_capability_permissions', 'migration.sql')

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
 * Permission keys this migration operated on, ensured before the fixture runs.
 *
 * They predate the capability rename, so `seedPermissions` no longer creates them and a
 * freshly seeded database has none. Ensured OUTSIDE the fixture transaction on purpose:
 * upserting a globally-unique key inside a long transaction that then rolls back makes
 * parallel integration files block on each other.
 */
const LEGACY_PERMISSION_KEYS = ['admin', 'program-viewer', 'territories-manager']

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

/** The permission keys a role grants, by key rather than id. */
async function keysFor(tx: Tx, roleId: number): Promise<string[]> {
  const rows = await tx.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { key: true } } },
  })
  return rows.map(r => r.permission.key).sort()
}

interface Captured {
  territoryRole: string[]
  programRole: string[]
  adminRole: string[]
  emptyRole: string[]
  /** Keys of the new capability permissions the migration must create. */
  newPermissionRows: string[]
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
        const stamp = `capperm-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`

        const permissionId = async (key: string) => {
          const id = legacyIds.get(key)
          if (id == null) throw new Error(`Legacy permission "${key}" was not ensured for this fixture`)
          return id
        }

        const congregation = await tx.congregation.create({
          data: { name: stamp, slug: stamp, active: true },
        })

        const roleWith = async (label: string, keys: string[]) => {
          const role = await tx.role.create({
            data: { key: `${stamp}-${label}`, isBuiltIn: false, congregationId: congregation.id },
          })
          for (const key of keys) {
            await tx.rolePermission.create({
              data: { roleId: role.id, permissionId: await permissionId(key), congregationId: congregation.id },
            })
          }
          return role
        }

        const territoryRole = await roleWith('territory', ['territories-manager'])
        const programRole = await roleWith('program', ['program-viewer'])
        const adminRole = await roleWith('admin', ['admin'])
        const emptyRole = await roleWith('empty', [])

        for (const statement of migrationStatements()) {
          await tx.$executeRawUnsafe(statement)
        }

        const countRows = async (): Promise<Record<string, number>> => ({
          rolePermissions: await tx.rolePermission.count({ where: { congregationId: congregation.id } }),
          permissions: await tx.permission.count(),
        })

        const countsAfterFirstRun = await countRows()

        captured = {
          territoryRole: await keysFor(tx, territoryRole.id),
          programRole: await keysFor(tx, programRole.id),
          adminRole: await keysFor(tx, adminRole.id),
          emptyRole: await keysFor(tx, emptyRole.id),
          newPermissionRows: (
            await tx.permission.findMany({
              where: { key: { startsWith: 'can-' } },
              select: { key: true },
            })
          )
            .map(r => r.key)
            .sort(),
          countsAfterFirstRun,
          countsAfterSecondRun: await (async () => {
            for (const statement of migrationStatements()) {
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

describe('20260827000000_add_capability_permissions', () => {
  it('creates the capability permission rows itself', async () => {
    const c = await runMigrationOverFixture()

    // seedPermissions() only runs at setup and at congregation registration, so on an
    // existing deployment these rows would never appear if the migration did not make them.
    expect(c.newPermissionRows).toContain('can-do-anything')
    expect(c.newPermissionRows).toContain('can-view-territories')
    expect(c.newPermissionRows).toContain('can-manage-territory-campaigns')
    expect(c.newPermissionRows.length).toBeGreaterThanOrEqual(45)
  })

  it('gives a territories-manager role every territory successor', async () => {
    const c = await runMigrationOverFixture()

    for (const key of [
      'can-manage-territories',
      'can-manage-territory-attributions',
      'can-manage-territory-campaigns',
      'can-plan-territory-splits',
      'can-configure-territory-settings',
      'can-record-prospection',
      'can-manage-buildings',
    ]) {
      expect(c.territoryRole).toContain(key)
    }
  })

  it('keeps the old grant so the running image still resolves permissions', async () => {
    const c = await runMigrationOverFixture()

    // The deployed image compares against the old keys. Removing them here would strip
    // every permission from every user until the image rolled — which it does not do
    // automatically. Retiring them is a separate release.
    expect(c.territoryRole).toContain('territories-manager')
    expect(c.programRole).toContain('program-viewer')
    expect(c.adminRole).toContain('admin')
  })

  it('grants can-view-absences to a programme viewer, offsetting the new requirement', async () => {
    const c = await runMigrationOverFixture()

    // Absences become gated on can-view-absences rather than admitted by can-view-programs,
    // so every current programme viewer must receive it or they lose visibility they have.
    expect(c.programRole).toContain('can-view-programs')
    expect(c.programRole).toContain('can-view-absences')
  })

  it('splits the admin-only capabilities out of admin', async () => {
    const c = await runMigrationOverFixture()

    expect(c.adminRole).toContain('can-do-anything')
    for (const key of [
      'can-configure-congregation',
      'can-import-congregation-data',
      'can-export-congregation-data',
      'can-delete-user-accounts',
      'can-anonymise-people',
    ]) {
      expect(c.adminRole).toContain(key)
    }
  })

  it('leaves a role holding nothing untouched', async () => {
    const c = await runMigrationOverFixture()
    expect(c.emptyRole).toEqual([])
  })

  it('is idempotent', async () => {
    const c = await runMigrationOverFixture()

    // Catches the class of bug where a second run re-inserts rows or forks on its own
    // output. Includes the global Permission count, which has no per-role conflict target.
    expect(c.countsAfterSecondRun).toEqual(c.countsAfterFirstRun)
  })
})
