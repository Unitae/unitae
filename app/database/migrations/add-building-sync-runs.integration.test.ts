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

const MIGRATION_SQL = resolve(import.meta.dirname, '20261110100000_add_building_sync_runs', 'migration.sql')

const CASCADE_FROM_CONGREGATION =
  /"BuildingSync_congregationId_fkey" FOREIGN KEY \("congregationId"\) REFERENCES "Congregation"\("id"\) ON DELETE CASCADE/

/** The shipped file's statements, comments stripped. */
function statements(): string[] {
  return readFileSync(MIGRATION_SQL, 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean)
}

// CI applies the migration before the suite runs, so its DDL is asserted by shape and only the
// backfill is executed here, inside a transaction that is always rolled back.
const BACKFILL = statements().filter(statement => statement.startsWith('UPDATE "Building"'))

/** Thrown to unwind the fixture; every assertion reads values captured before it. */
class Rollback extends Error {}

interface Snapshot {
  listed: Date | null
  handMade: Date | null
  alreadyDated: Date | null
  afterSecondRun: { listed: Date | null; alreadyDated: Date | null }
}

let snapshot: Promise<Snapshot> | undefined

function runFixture(): Promise<Snapshot> {
  snapshot ??= (async () => {
    let captured: Snapshot | undefined
    const earlier = new Date('2026-01-15T10:00:00Z')
    try {
      await testDb.$transaction(async tx => {
        const stamp = `syncmig-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregation = await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })
        const base = { street: 'Rue de la Migration', zip: '93260', congregationId: congregation.id }
        const listed = await tx.building.create({ data: { ...base, number: '1', inOpenData: true } })
        const handMade = await tx.building.create({ data: { ...base, number: '2', inOpenData: false } })
        const alreadyDated = await tx.building.create({
          data: { ...base, number: '3', inOpenData: true, lastSeenInSourceAt: earlier },
        })

        const read = async (id: number) =>
          (await tx.building.findUniqueOrThrow({ where: { id }, select: { lastSeenInSourceAt: true } }))
            .lastSeenInSourceAt

        for (const statement of BACKFILL) await tx.$executeRawUnsafe(statement)
        const first = {
          listed: await read(listed.id),
          handMade: await read(handMade.id),
          alreadyDated: await read(alreadyDated.id),
        }
        for (const statement of BACKFILL) await tx.$executeRawUnsafe(statement)
        captured = {
          ...first,
          afterSecondRun: { listed: await read(listed.id), alreadyDated: await read(alreadyDated.id) },
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

afterAll(async () => {
  await testDb.$disconnect()
})

describe('20261110100000_add_building_sync_runs', () => {
  it('ships exactly one backfill statement', () => {
    expect(BACKFILL).toHaveLength(1)
  })

  it('protects the new table with the tenant-isolation policy', () => {
    const sql = statements().join(';\n')
    expect(sql).toContain('ALTER TABLE "BuildingSync" FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('CREATE POLICY tenant_isolation ON "BuildingSync"')
  })

  it('deletes a congregation’s runs with it, so tenant deletion needs no new step', () => {
    expect(statements().join('\n')).toMatch(CASCADE_FROM_CONGREGATION)
  })

  it('dates every building the last sync listed', async () => {
    const { listed } = await runFixture()
    expect(listed).toBeInstanceOf(Date)
  })

  it('leaves a building no sync is known to have listed undated', async () => {
    const { handMade } = await runFixture()
    expect(handMade).toBeNull()
  })

  it('keeps a date already written, and changes nothing when run twice', async () => {
    const { listed, alreadyDated, afterSecondRun } = await runFixture()
    expect(alreadyDated?.toISOString()).toBe('2026-01-15T10:00:00.000Z')
    expect(afterSecondRun.alreadyDated?.toISOString()).toBe('2026-01-15T10:00:00.000Z')
    expect(afterSecondRun.listed?.toISOString()).toBe(listed?.toISOString())
  })
})
