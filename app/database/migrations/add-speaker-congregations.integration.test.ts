import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { normalizeCongregationName } from '~/features/events/model/speaker-congregation-name'

// Runs against DB_URL: a migration executes as the schema owner, which the RLS-bound runtime role is not.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

const NORM_EXPRESSION = /translate\([\s\S]*?\) AS "norm"/
const NORM_ALIAS = / AS "norm"$/

const MIGRATION_SQL = resolve(import.meta.dirname, '20261111180000_add_speaker_congregations', 'migration.sql')

/** The shipped file, split into statements: a test that re-typed the SQL would pass after an edit. */
function migrationStatements(): string[] {
  return readFileSync(MIGRATION_SQL, 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0)
}

/** The data steps only: CI applies every migration before the tests, so the tables and columns already exist. */
function backfillStatements(): string[] {
  return migrationStatements().filter(statement => statement.startsWith('INSERT') || statement.startsWith('UPDATE'))
}

/** Thrown to roll the fixture back; every assertion runs on captured values. */
class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

interface SpeakerLink {
  name: string
  congregation: string | null
}

interface Captured {
  /** Speaker name → the linked congregation's display name, for the tenant under test. */
  links: SpeakerLink[]
  /** Display names of the tenant's congregations, sorted. */
  congregations: string[]
  /** The other tenant's congregation names: the backfill must not mix tenants. */
  otherTenant: string[]
  countsAfterFirst: { congregations: number; linked: number }
  countsAfterSecond: { congregations: number; linked: number }
  /** Spelling → the key SQL computed for it, to hold against normalizeCongregationName(). */
  sqlKeys: Record<string, string>
}

const UGLY_SPELLINGS = [
  'Bagnolet',
  'BAGNOLET  ',
  '  bagnolét',
  'Montreuil-Est',
  'montreuil  est',
  'Montreuil–Est',
  'L’Haÿ-les-Roses',
  "L'Hay les Roses",
  'Saint-Ouen-Ç',
]

let fixtureRun: Promise<Captured> | undefined

/** Memoized: every assertion reads the same snapshot. */
function runMigrationOverFixture(): Promise<Captured> {
  fixtureRun ??= executeMigrationOverFixture()
  return fixtureRun
}

async function executeMigrationOverFixture(): Promise<Captured> {
  let captured: Captured | undefined
  const statements = backfillStatements()

  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `spkcong-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const cong = await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })
        const other = await tx.congregation.create({ data: { name: `${stamp}-b`, slug: `${stamp}-b`, active: true } })
        const speaker = (name: string, congregationName: string, congregationId = cong.id) =>
          tx.externalSpeaker.create({ data: { name, congregationName, congregationId } })

        // Three spellings of Bagnolet, two of them by the same speakers: « Bagnolet » is used most and names it.
        await speaker('Paul LEROY', 'Bagnolet')
        await speaker('Hugo BLANC', 'Bagnolet')
        await speaker('Jean-Marc FAURE', 'BAGNOLET  ')
        await speaker('Samuel NKOMO', '  bagnolét')
        // Hyphen, spaces and an en dash: one congregation. A tie between spellings goes to the alphabetical first.
        await speaker('Rémi GAUTIER', 'Montreuil-Est')
        await speaker('Lucas TESSIER', 'montreuil  est')
        // A name no mapping anticipated still gets its congregation.
        await speaker('Kevin ROCHE', 'Noisy-le-Sec (salle 2)')
        // The legacy rows with no congregation stay unlinked.
        await speaker('M. DIALLO', '')
        await speaker('M. NOËL', '   ')
        // Another tenant with the same name: its own congregation.
        await speaker('Étienne VIDAL', 'Bagnolet', other.id)

        const counts = async () => ({
          congregations: await tx.speakerCongregation.count({ where: { congregationId: cong.id } }),
          linked: await tx.externalSpeaker.count({
            where: { congregationId: cong.id, speakerCongregationId: { not: null } },
          }),
        })

        for (const statement of statements) await tx.$executeRawUnsafe(statement)
        const countsAfterFirst = await counts()
        for (const statement of statements) await tx.$executeRawUnsafe(statement)
        const countsAfterSecond = await counts()

        const speakers = await tx.externalSpeaker.findMany({
          where: { congregationId: cong.id },
          select: { name: true, speakerCongregation: { select: { name: true } } },
          orderBy: { name: 'asc' },
        })
        const congregations = await tx.speakerCongregation.findMany({
          where: { congregationId: cong.id },
          select: { name: true },
          orderBy: { name: 'asc' },
        })
        const otherTenant = await tx.speakerCongregation.findMany({
          where: { congregationId: other.id },
          select: { name: true },
        })

        // The SQL key for each ugly spelling, extracted from the shipped expression itself.
        const insert = statements.find(statement => statement.startsWith('INSERT'))
        const expression = insert?.match(NORM_EXPRESSION)?.[0].replace(NORM_ALIAS, '')
        if (expression == null) throw new Error('normalization expression not found in the migration')
        const sqlKeys: Record<string, string> = {}
        for (const spelling of UGLY_SPELLINGS) {
          const sql = `SELECT ${expression.replaceAll('"congregationName"', '$1::text')} AS key`
          const rows = await tx.$queryRawUnsafe<{ key: string }[]>(sql, spelling)
          sqlKeys[spelling] = rows[0]?.key ?? ''
        }

        captured = {
          links: speakers.map(s => ({ name: s.name, congregation: s.speakerCongregation?.name ?? null })),
          congregations: congregations.map(c => c.name),
          otherTenant: otherTenant.map(c => c.name),
          countsAfterFirst,
          countsAfterSecond,
          sqlKeys,
        }
        throw new Rollback()
      },
      { timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  if (captured == null) throw new Error('fixture did not capture')
  return captured
}

describe('20261111180000_add_speaker_congregations', () => {
  it('creates one congregation per spelling, named after the spelling most speakers use', async () => {
    const { congregations } = await runMigrationOverFixture()
    expect(congregations).toEqual(['Bagnolet', 'Montreuil-Est', 'Noisy-le-Sec (salle 2)'])
  })

  it('links every speaker that had a congregation, and leaves the others unlinked', async () => {
    const { links } = await runMigrationOverFixture()
    expect(links).toEqual([
      { name: 'Hugo BLANC', congregation: 'Bagnolet' },
      { name: 'Jean-Marc FAURE', congregation: 'Bagnolet' },
      { name: 'Kevin ROCHE', congregation: 'Noisy-le-Sec (salle 2)' },
      { name: 'Lucas TESSIER', congregation: 'Montreuil-Est' },
      { name: 'M. DIALLO', congregation: null },
      { name: 'M. NOËL', congregation: null },
      { name: 'Paul LEROY', congregation: 'Bagnolet' },
      { name: 'Rémi GAUTIER', congregation: 'Montreuil-Est' },
      { name: 'Samuel NKOMO', congregation: 'Bagnolet' },
    ])
  })

  it('keeps tenants apart', async () => {
    const { otherTenant } = await runMigrationOverFixture()
    expect(otherTenant).toEqual(['Bagnolet'])
  })

  it('is idempotent: a second run changes nothing', async () => {
    const { countsAfterFirst, countsAfterSecond } = await runMigrationOverFixture()
    expect(countsAfterFirst).toEqual({ congregations: 3, linked: 7 })
    expect(countsAfterSecond).toEqual(countsAfterFirst)
  })

  it('computes the same key as normalizeCongregationName, which the archive import uses', async () => {
    const { sqlKeys } = await runMigrationOverFixture()
    for (const spelling of UGLY_SPELLINGS) {
      expect({ spelling, key: sqlKeys[spelling] }).toEqual({ spelling, key: normalizeCongregationName(spelling) })
    }
  })
})
