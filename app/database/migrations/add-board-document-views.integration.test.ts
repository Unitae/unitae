import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

afterAll(async () => {
  await testDb.$disconnect()
})

const MIGRATIONS = join(import.meta.dirname)
const DROPS_OLD_JOIN = /DROP\s+TABLE\s+"_viewedBy"/i
const MIGRATION_DIR = readdirSync(MIGRATIONS).find(name => name.endsWith('_add_board_document_views'))

function shippedStatements(): string[] {
  if (!MIGRATION_DIR) throw new Error('the add_board_document_views migration is missing')
  const sql = readFileSync(join(MIGRATIONS, MIGRATION_DIR, 'migration.sql'), 'utf8')
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean)
}

/** The backfill only: the DDL is asserted against the applied database, as CI runs `migrate deploy` first. */
function backfill(): string {
  const inserts = shippedStatements().filter(s => s.startsWith('INSERT INTO "BoardDocumentView"'))
  expect(inserts).toHaveLength(1)
  return inserts[0]
}

/** Thrown to unwind the fixtures; every assertion runs on values captured before it. */
class Rollback extends Error {}

type Row = { documentId: number; userId: number; viewedAt: Date | null; congregationId: number }

interface Snapshot {
  congregationId: number
  docs: { read: number; unread: number; alreadyMigrated: number }
  users: number[]
  datedRead: Date
  afterFirstRun: Row[]
  afterSecondRun: Row[]
}

let snapshot: Promise<Snapshot> | undefined

/** One fixture for the whole file: build it, run the backfill twice, capture, roll back. */
function migrated(): Promise<Snapshot> {
  snapshot ??= (async () => {
    let captured: Snapshot | undefined
    try {
      await testDb.$transaction(async tx => {
        const stamp = `bdv-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregation = await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })
        const congregationId = congregation.id
        const section = await tx.boardSection.create({ data: { name: stamp, congregationId } })
        const doc = (suffix: string) =>
          tx.boardDocument.create({ data: { title: `${stamp}-${suffix}`, sectionId: section.id, congregationId } })
        const [read, unread, alreadyMigrated] = await Promise.all([doc('read'), doc('unread'), doc('migrated')])
        const users = await Promise.all(
          ['a', 'b'].map(suffix =>
            tx.userAccount.create({
              data: { email: `${stamp}-${suffix}@example.test`, password: 'x', congregationId },
            }),
          ),
        )
        const [alice, bob] = users

        // Reads as the old implicit relation stored them: A = BoardDocument, B = UserAccount.
        await tx.$executeRawUnsafe(
          `INSERT INTO "_viewedBy" ("A", "B") VALUES ($1, $2), ($1, $3), ($4, $2)`,
          read.id,
          alice.id,
          bob.id,
          alreadyMigrated.id,
        )
        // Alice's read of this one was already recorded with a date; the backfill must leave it be.
        const datedRead = new Date('2026-11-01T10:00:00Z')
        await tx.$executeRawUnsafe(
          `INSERT INTO "BoardDocumentView" ("documentId", "userId", "viewedAt", "congregationId") VALUES ($1, $2, $3, $4)`,
          alreadyMigrated.id,
          alice.id,
          datedRead,
          congregationId,
        )

        const rows = () =>
          tx.$queryRawUnsafe<Row[]>(
            `SELECT "documentId", "userId", "viewedAt", "congregationId" FROM "BoardDocumentView"
             WHERE "congregationId" = $1 ORDER BY "documentId", "userId"`,
            congregationId,
          )

        await tx.$executeRawUnsafe(backfill())
        const afterFirstRun = await rows()
        await tx.$executeRawUnsafe(backfill())
        const afterSecondRun = await rows()

        captured = {
          congregationId,
          docs: { read: read.id, unread: unread.id, alreadyMigrated: alreadyMigrated.id },
          users: [alice.id, bob.id],
          datedRead,
          afterFirstRun,
          afterSecondRun,
        }
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (!captured) throw new Error('fixture did not run')
    return captured
  })()
  return snapshot
}

describe('add_board_document_views', () => {
  it('keeps every read of the old relation, without inventing when it happened', async () => {
    const s = await migrated()
    const [alice, bob] = s.users
    const ofRead = s.afterFirstRun.filter(r => r.documentId === s.docs.read)

    expect(ofRead.map(r => r.userId).sort()).toEqual([alice, bob].sort())
    expect(ofRead.every(r => r.viewedAt === null)).toBe(true)
    expect(ofRead.every(r => r.congregationId === s.congregationId)).toBe(true)
  })

  it('leaves a read that already carries a date as it is', async () => {
    const s = await migrated()
    const [alice] = s.users
    const ofMigrated = s.afterFirstRun.filter(r => r.documentId === s.docs.alreadyMigrated)

    expect(ofMigrated).toHaveLength(1)
    expect(ofMigrated[0].userId).toBe(alice)
    expect(ofMigrated[0].viewedAt?.toISOString()).toBe(s.datedRead.toISOString())
  })

  it('gives a document nobody read no reads', async () => {
    const s = await migrated()
    expect(s.afterFirstRun.some(r => r.documentId === s.docs.unread)).toBe(false)
  })

  it('changes nothing when run again', async () => {
    const s = await migrated()
    expect(s.afterFirstRun).toHaveLength(3)
    expect(s.afterSecondRun).toEqual(s.afterFirstRun)
  })

  it('keeps the old join table, which the application still deployed reads and writes', () => {
    const statements = shippedStatements().join('\n')
    expect(statements).not.toMatch(DROPS_OLD_JOIN)
  })

  it('isolates reads by congregation', async () => {
    const policies = await testDb.$queryRawUnsafe<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'BoardDocumentView'`,
    )
    expect(policies).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }])

    const policy = await testDb.$queryRawUnsafe<{ policyname: string }[]>(
      `SELECT policyname FROM pg_policies WHERE tablename = 'BoardDocumentView'`,
    )
    expect(policy.map(p => p.policyname)).toEqual(['tenant_isolation'])
  })

  it('ties each read to its document within the same congregation', async () => {
    const fks = await testDb.$queryRawUnsafe<{ conname: string; definition: string }[]>(
      `SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE conrelid = '"BoardDocumentView"'::regclass AND contype = 'f'`,
    )
    const toDocument = fks.find(fk => fk.definition.includes('REFERENCES "BoardDocument"'))
    expect(toDocument?.definition).toContain('("documentId", "congregationId")')
    expect(toDocument?.definition).toContain('ON DELETE CASCADE')
  })
})
