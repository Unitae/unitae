import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner.
const adapter = new PrismaPg({
  connectionString: process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const MIGRATION_SQL = resolve(import.meta.dirname, '20260828000000_add_organigram_tree', 'migration.sql')

/**
 * Unlike the data migrations in this directory, this one is pure DDL and is NOT re-executed
 * inside a rolled-back transaction.
 *
 * `ALTER TABLE ADD COLUMN` takes an ACCESS EXCLUSIVE lock on `Role` and holds it until the
 * transaction ends. Integration files run in parallel against one database, so a fixture that
 * held that lock would stall every unrelated suite touching roles — the failure mode is random
 * timeouts in other files, which is exactly what a previous migration test in this directory
 * caused. CI applies migrations before the suite runs (`prisma migrate deploy && prisma db
 * seed`), so the columns are already there: assert the applied result instead of re-applying.
 *
 * Idempotence is therefore asserted by reading the shipped SQL rather than running it twice.
 */
function migrationSql(): string {
  return readFileSync(MIGRATION_SQL, 'utf8')
}

/** Thrown to unwind the fixtures; every assertion runs on values captured before it. */
class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('20260828000000_add_organigram_tree', () => {
  it('is written to be re-runnable', () => {
    const sql = migrationSql()

    // A migration that has already been applied to a congregation's database must not fail if
    // it runs again — Prisma will not re-run it, but a restored backup or a hand-applied
    // environment can.
    const addColumns = sql.match(/ADD COLUMN/gi) ?? []
    expect(addColumns.length).toBeGreaterThan(0)
    expect(sql.match(/ADD COLUMN IF NOT EXISTS/gi) ?? []).toHaveLength(addColumns.length)
  })

  it('adds the tree columns to Role', async () => {
    const columns = await testDb.$queryRaw<
      { column_name: string; is_nullable: string; column_default: string | null }[]
    >`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'Role'
        AND column_name IN ('parentRoleId', 'showInOrganigram', 'organigramOrder', 'organigramNote')
      ORDER BY column_name
    `
    expect(columns.map(c => c.column_name)).toEqual([
      'organigramNote',
      'organigramOrder',
      'parentRoleId',
      'showInOrganigram',
    ])

    // Everything except the flag stays nullable, so the migration is additive against a
    // deployed image that has not rolled.
    const flag = columns.find(c => c.column_name === 'showInOrganigram')
    expect(flag?.is_nullable).toBe('NO')
    expect(flag?.column_default).toContain('false')
    for (const name of ['parentRoleId', 'organigramOrder', 'organigramNote']) {
      expect(columns.find(c => c.column_name === name)?.is_nullable).toBe('YES')
    }
  })

  it('defaults every existing assignment to member', async () => {
    const columns = await testDb.$queryRaw<{ is_nullable: string; column_default: string | null }[]>`
      SELECT is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'UserRoleAssignment' AND column_name = 'kind'
    `
    expect(columns).toHaveLength(1)
    expect(columns[0]?.is_nullable).toBe('NO')
    expect(columns[0]?.column_default).toContain('member')

    // What actually matters: a row written without a kind — every grant made outside the
    // organigram, and every row that predates the column — reads as a plain member. Counting
    // non-member rows across the table was the wrong test; once the feature is in use, leaders
    // and deputies exist by design.
    let captured: string | undefined
    try {
      await testDb.$transaction(async tx => {
        const stamp = `kinddef-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregation = await tx.congregation.create({
          data: { name: stamp, slug: stamp, active: true },
        })
        const role = await tx.role.create({
          data: { key: `${stamp}-role`, isBuiltIn: false, congregationId: congregation.id },
        })
        const account = await tx.userAccount.create({
          data: { email: `${stamp}@test.com`, password: 'x', congregationId: congregation.id },
        })
        // Deliberately no `kind` — this is every non-organigram writer of this table.
        await tx.$executeRaw`
          INSERT INTO "UserRoleAssignment" ("userId", "roleId", "congregationId")
          VALUES (${account.id}, ${role.id}, ${congregation.id})
        `
        const [row] = await tx.$queryRaw<{ kind: string }[]>`
          SELECT "kind" FROM "UserRoleAssignment" WHERE "userId" = ${account.id} AND "roleId" = ${role.id}
        `
        captured = row?.kind
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }

    expect(captured).toBe('member')
  })

  it('refuses a parent in another congregation, at the database', async () => {
    let captured: { code?: string; message: string } | undefined

    try {
      await testDb.$transaction(async tx => {
        const stamp = `orgtree-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const [left, right] = await Promise.all([
          tx.congregation.create({ data: { name: `${stamp}-a`, slug: `${stamp}-a`, active: true } }),
          tx.congregation.create({ data: { name: `${stamp}-b`, slug: `${stamp}-b`, active: true } }),
        ])

        const parent = await tx.role.create({
          data: { key: `${stamp}-parent`, isBuiltIn: false, congregationId: left.id },
        })

        try {
          await tx.role.create({
            data: { key: `${stamp}-child`, isBuiltIn: false, congregationId: right.id, parentRoleId: parent.id },
          })
        } catch (error) {
          captured = { code: (error as { code?: string }).code, message: (error as Error).message }
        }

        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }

    // The composite FK targets [id, congregationId], so tenancy here is enforced by Postgres
    // rather than by a service check that a future caller could forget.
    expect(captured, 'cross-congregation parent was accepted').toBeDefined()
    expect(captured?.code).toBe('P2003')
  })
})
