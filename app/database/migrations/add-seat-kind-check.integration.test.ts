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

const MIGRATION_SQL = resolve(import.meta.dirname, '20260830120000_add_seat_kind_check', 'migration.sql')

const RERUNNABLE_GUARD = /IF NOT EXISTS\s*\(\s*SELECT 1 FROM pg_constraint/i

// Pure DDL, so — like the other organigram migration tests — it is asserted against the applied
// database rather than re-executed here: CI runs `prisma migrate deploy` before the suite, and
// re-applying would hold an ACCESS EXCLUSIVE lock that stalls every parallel suite.

/** Thrown to unwind the fixtures; every assertion runs on values captured before it. */
class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('20260830120000_add_seat_kind_check', () => {
  it('is written to be re-runnable', () => {
    const sql = readFileSync(MIGRATION_SQL, 'utf8')
    expect(sql).toMatch(RERUNNABLE_GUARD)
  })

  it('rejects a seat kind the application never writes', async () => {
    let captured: { message: string } | undefined

    try {
      await testDb.$transaction(async tx => {
        const stamp = `kindchk-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregation = await tx.congregation.create({
          data: { name: stamp, slug: stamp, active: true },
        })
        const role = await tx.role.create({
          data: { key: `${stamp}-role`, isBuiltIn: false, congregationId: congregation.id },
        })
        const account = await tx.userAccount.create({
          data: { email: `${stamp}@test.com`, password: 'x', congregationId: congregation.id },
        })

        try {
          await tx.$executeRaw`
            INSERT INTO "UserRoleAssignment" ("userId", "roleId", "congregationId", "kind")
            VALUES (${account.id}, ${role.id}, ${congregation.id}, 'president')
          `
        } catch (error) {
          captured = { message: (error as Error).message }
        }

        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }

    expect(captured, 'an arbitrary kind was accepted').toBeDefined()
    expect(captured?.message).toContain('UserRoleAssignment_kind_check')
  })

  it('still accepts the three kinds the application writes', async () => {
    const written: string[] = []

    try {
      await testDb.$transaction(async tx => {
        const stamp = `kindok-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregation = await tx.congregation.create({
          data: { name: stamp, slug: stamp, active: true },
        })
        for (const kind of ['leader', 'deputy', 'member']) {
          const role = await tx.role.create({
            data: { key: `${stamp}-${kind}`, isBuiltIn: false, congregationId: congregation.id },
          })
          const account = await tx.userAccount.create({
            data: { email: `${stamp}-${kind}@test.com`, password: 'x', congregationId: congregation.id },
          })
          const row = await tx.userRoleAssignment.create({
            data: { userId: account.id, roleId: role.id, congregationId: congregation.id, kind },
          })
          written.push(row.kind)
        }
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }

    expect(written).toEqual(['leader', 'deputy', 'member'])
  })
})
