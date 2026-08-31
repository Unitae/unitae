import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

// Hoisted: a regex literal inside a function body is a lint error in this repo.
const DROP_COLUMN_RE = /DROP COLUMN "type"/
const DROP_CONSTRAINT_RE = /DROP CONSTRAINT IF EXISTS "member_pioneer_requires_baptism"/
const ALTER_TABLE_RE = /ALTER TABLE "(\w+)"/g

const MIGRATION_SQL = resolve(import.meta.dirname, '20260831230000_drop_member_type', 'migration.sql')

function migrationSql(): string {
  return readFileSync(MIGRATION_SQL, 'utf8')
}

function migrationStatements(): string[] {
  return migrationSql()
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0)
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('drop Member.type (migration)', () => {
  // Not executed here. DROP COLUMN takes ACCESS EXCLUSIVE on Member and every table whose foreign
  // keys reference it, held until rollback — running it in a fixture deadlocks unrelated suites at
  // random. The shape of the file is what this asserts; that it applies cleanly is proved by CI
  // running `prisma migrate deploy` against a fresh database before any test executes.
  it('drops the dependent CHECK constraint before the column', () => {
    const statements = migrationStatements()
    const constraintIndex = statements.findIndex(s => s.includes('member_pioneer_requires_baptism'))
    const columnIndex = statements.findIndex(s => DROP_COLUMN_RE.test(s))

    expect(constraintIndex).toBeGreaterThanOrEqual(0)
    expect(columnIndex).toBeGreaterThanOrEqual(0)
    // Postgres refuses to drop a column a constraint still references, so the order is load-bearing.
    expect(constraintIndex).toBeLessThan(columnIndex)
  })

  it('drops the constraint idempotently', () => {
    expect(migrationSql()).toMatch(DROP_CONSTRAINT_RE)
  })

  it('touches only Member', () => {
    const tables = [...migrationSql().matchAll(ALTER_TABLE_RE)].map(match => match[1])
    expect([...new Set(tables)]).toEqual(['Member'])
  })
})
