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

const MIGRATION_SQL = resolve(import.meta.dirname, '20260830130000_add_single_person_roles', 'migration.sql')

const ADD_COLUMN = /ADD COLUMN IF NOT EXISTS "isSinglePerson"/i

// Pure DDL plus an idempotent backfill, so — like the other organigram migration tests — it is
// asserted against the applied database rather than re-executed here: CI runs `prisma migrate
// deploy` before the suite, and re-applying would hold an ACCESS EXCLUSIVE lock on Role that
// stalls every parallel suite.

/** Thrown to unwind the fixtures; every assertion runs on values captured before it. */
class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('20260830130000_add_single_person_roles', () => {
  it('is written to be re-runnable', () => {
    const sql = readFileSync(MIGRATION_SQL, 'utf8')
    expect(sql).toMatch(ADD_COLUMN)
    // The backfill re-runs harmlessly: it only ever flips false to true on the three post keys.
    expect(sql).toContain('"isSinglePerson" = false')
  })

  it('adds the flag as NOT NULL with a false default', async () => {
    const columns = await testDb.$queryRaw<{ is_nullable: string; column_default: string | null }[]>`
      SELECT is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'Role' AND column_name = 'isSinglePerson'
    `
    expect(columns).toHaveLength(1)
    expect(columns[0]?.is_nullable).toBe('NO')
    expect(columns[0]?.column_default).toContain('false')
  })

  it('leaves a plain new role a group', async () => {
    let captured: boolean | undefined
    try {
      await testDb.$transaction(async tx => {
        const stamp = `single-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregation = await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })
        // Deliberately no flag — this is every writer that predates the column.
        const role = await tx.role.create({
          data: { key: `${stamp}-role`, isBuiltIn: false, congregationId: congregation.id },
        })
        captured = role.isSinglePerson
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    expect(captured).toBe(false)
  })
})
