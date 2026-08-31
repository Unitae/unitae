import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { PublisherType } from '~/shared/types/publisher-type'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

const MIGRATION_SQL = resolve(
  import.meta.dirname,
  '20260831200000_backfill_standing_pioneer_enrolments',
  'migration.sql',
)

// The shipped artifact, not a paraphrase — a test that retyped the SQL would keep passing after
// someone edited the file.
function migrationStatements(): string[] {
  return readFileSync(MIGRATION_SQL, 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0)
}

/** Thrown to roll the fixture back; every assertion runs on captured values. */
class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

interface StintShape {
  type: PublisherType
  startMonth: number
  startYear: number
  endMonth: number | null
  endYear: number | null
}

interface Captured {
  withActivity: StintShape[]
  neverReported: StintShape[]
  normalMember: StintShape[]
  anonymized: StintShape[]
  departed: StintShape[]
  alreadyEnrolled: StintShape[]
  rowsAfterFirstRun: number
  rowsAfterSecondRun: number
  pioneersBefore: number[]
  pioneersAfter: number[]
}

let fixture: Promise<Captured> | undefined

// Memoized: every `it` reads one snapshot instead of re-running the transaction.
function runMigrationOverFixture(): Promise<Captured> {
  fixture ??= execute()
  return fixture
}

async function execute(): Promise<Captured> {
  let captured: Captured | undefined
  const statements = migrationStatements()

  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `mig-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregation = await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })
        const congregationId = congregation.id

        // baptismDate is not optional here: a `member_pioneer_requires_baptism` CHECK constraint
        // means a pioneer-typed row cannot exist without one, which also bounds the population this
        // migration can ever see.
        const makeMember = (firstname: string, type: PublisherType) =>
          tx.member.create({
            data: {
              firstname,
              lastname: stamp,
              isPublisher: true,
              type,
              baptismDate: new Date('2015-01-01'),
              congregationId,
            },
          })

        // Has reported activity — the stint should start at their EARLIEST reported month.
        const withActivity = await makeMember('WithActivity', PublisherType.PionnierPermanant)
        for (const [month, year] of [
          [5, 2025],
          [2, 2024],
          [7, 2025],
        ]) {
          await tx.publisherActivity.create({
            data: { publisherId: withActivity.id, month, year, hours: 50, congregationId },
          })
        }

        // Never reported. The LEFT JOIN must still produce a stint — an INNER JOIN would drop this
        // member, and dropping Member.type afterwards would revoke their role with no trace.
        const neverReported = await makeMember('NeverReported', PublisherType.PionnierSpecial)

        // Nothing to migrate.
        const normalMember = await makeMember('NormalPublisher', PublisherType.Normal)

        // Anonymized members are terminal — memberAggregate.anonymize refuses to run twice and
        // always sets leftAt, so they can never be a pioneer again under either model. A stint for
        // them would be pure noise attached to a scrubbed person.
        const anonymized = await makeMember('Anonymized', PublisherType.PionnierPermanant)
        await tx.member.update({
          where: { id: anonymized.id },
          data: { anonymizedAt: new Date(), leftAt: new Date() },
        })

        // A member who LEFT but was not anonymized still gets a stint: the old predicate read
        // `leftAt == null && type !== Normal`, so clearing leftAt restored their pioneer role.
        // Skipping them here would change behaviour on return, not preserve it.
        const departed = await makeMember('Departed', PublisherType.PionnierPermanant)
        await tx.member.update({ where: { id: departed.id }, data: { leftAt: new Date() } })

        // Already has a stint — the migration must not add a second, overlapping one.
        const alreadyEnrolled = await makeMember('AlreadyEnrolled', PublisherType.PionnierPermanant)
        await tx.pioneerEnrolment.create({
          data: {
            memberId: alreadyEnrolled.id,
            congregationId,
            type: PublisherType.Missionnaire,
            startMonth: 8,
            startYear: 2023,
          },
        })

        const pioneerIds = [withActivity.id, neverReported.id, alreadyEnrolled.id, departed.id]
        const countRows = async () => tx.pioneerEnrolment.count({ where: { congregationId } })

        for (const statement of statements) await tx.$executeRawUnsafe(statement)
        const rowsAfterFirstRun = await countRows()

        // Idempotence: a second run must be a no-op.
        for (const statement of statements) await tx.$executeRawUnsafe(statement)
        const rowsAfterSecondRun = await countRows()

        const stintsFor = async (memberId: number): Promise<StintShape[]> =>
          (
            await tx.pioneerEnrolment.findMany({
              where: { memberId, congregationId },
              select: { type: true, startMonth: true, startYear: true, endMonth: true, endYear: true },
              orderBy: { id: 'asc' },
            })
          ).map(s => ({ ...s }))

        // "Is a pioneer" re-derived from the tables, before (column) and after (an ongoing stint).
        const ongoing = await tx.pioneerEnrolment.findMany({
          where: { congregationId, endMonth: null },
          select: { memberId: true },
        })

        captured = {
          withActivity: await stintsFor(withActivity.id),
          neverReported: await stintsFor(neverReported.id),
          normalMember: await stintsFor(normalMember.id),
          anonymized: await stintsFor(anonymized.id),
          departed: await stintsFor(departed.id),
          alreadyEnrolled: await stintsFor(alreadyEnrolled.id),
          rowsAfterFirstRun,
          rowsAfterSecondRun,
          pioneersBefore: pioneerIds.sort((a, b) => a - b),
          pioneersAfter: [...new Set(ongoing.map(o => o.memberId))].sort((a, b) => a - b),
        }

        throw new Rollback()
      },
      { timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }

  if (!captured) throw new Error('fixture did not run')
  return captured
}

describe('backfill standing pioneer enrolments (migration)', () => {
  it('gives a member with reported activity one ongoing stint starting at their earliest month', async () => {
    const { withActivity } = await runMigrationOverFixture()
    expect(withActivity).toHaveLength(1)
    // Sanity-pinned: earliest of (5/2025, 2/2024, 7/2025) is month 2 of 2024, not the first inserted.
    expect(withActivity[0]).toEqual({
      type: PublisherType.PionnierPermanant,
      startMonth: 2,
      startYear: 2024,
      endMonth: null,
      endYear: null,
    })
  })

  it('still enrols a member who never reported, rather than dropping them', async () => {
    const { neverReported } = await runMigrationOverFixture()
    expect(neverReported).toHaveLength(1)
    expect(neverReported[0].type).toBe(PublisherType.PionnierSpecial)
    expect(neverReported[0].endMonth).toBeNull()
    // Falls back to September of the current service year.
    expect(neverReported[0].startMonth).toBe(8)
  })

  it('skips an anonymized member — they can never be a pioneer again', async () => {
    const { anonymized } = await runMigrationOverFixture()
    expect(anonymized).toEqual([])
  })

  it('still enrols a member who left, because clearing leftAt used to restore their role', async () => {
    const { departed } = await runMigrationOverFixture()
    expect(departed).toHaveLength(1)
    expect(departed[0].endMonth).toBeNull()
  })

  it('leaves a normal publisher with no stint', async () => {
    const { normalMember } = await runMigrationOverFixture()
    expect(normalMember).toEqual([])
  })

  it('does not touch a member who already has a stint', async () => {
    const { alreadyEnrolled } = await runMigrationOverFixture()
    expect(alreadyEnrolled).toHaveLength(1)
    // Their existing Missionnaire stint survives; the Member.type column is NOT re-imposed on it.
    expect(alreadyEnrolled[0].type).toBe(PublisherType.Missionnaire)
    expect(alreadyEnrolled[0].startYear).toBe(2023)
  })

  it('is idempotent — a second run adds nothing', async () => {
    const { rowsAfterFirstRun, rowsAfterSecondRun } = await runMigrationOverFixture()
    expect(rowsAfterFirstRun).toBe(4)
    expect(rowsAfterSecondRun).toBe(rowsAfterFirstRun)
  })

  it('preserves who counts as a pioneer', async () => {
    const { pioneersBefore, pioneersAfter } = await runMigrationOverFixture()
    expect(pioneersAfter).toEqual(pioneersBefore)
  })
})
