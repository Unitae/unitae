import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// 20261202090000_part_preset_student_slip: the seeded student kinds offer the S-89 slip, every other kind starts
// without it. CI applies the migration before the suite: the update is replayed on rows written without it.

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 }),
})

afterAll(async () => {
  await db.$disconnect()
})

const shipped = readFileSync(join(__dirname, '20261202090000_part_preset_student_slip', 'migration.sql'), 'utf8')
const statements = shipped
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement !== '')

class Rollback extends Error {}

type Snapshot = Record<string, boolean>

/** Every kind of a fresh congregation as older code wrote it (the option off), then the migration, once or twice. */
async function migrate(times: number): Promise<{ after: Snapshot; count: number }> {
  let result: { after: Snapshot; count: number } | undefined
  try {
    await db.$transaction(async t => {
      const tx = t as unknown as PrismaClient
      const stamp = `slip-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      const kind = (key: string, isSystem: boolean) =>
        tx.partPreset.create({ data: { key, isSystem, printsStudentSlip: false, congregationId } })
      await kind('bible-reading', true)
      await kind('school-demonstration', true)
      await kind('school-talk', true)
      await kind('midweek-talk', true)
      await kind('prayer', true)
      // The congregation's own kind, even one named like a seeded key, keeps the option off.
      await kind('school-talk-2', false)
      await kind('exposé-perso', false)

      for (let run = 0; run < times; run++) {
        for (const statement of statements) await tx.$executeRawUnsafe(statement)
      }

      const rows = await tx.partPreset.findMany({
        where: { congregationId },
        select: { key: true, printsStudentSlip: true },
      })
      result = { after: Object.fromEntries(rows.map(row => [row.key, row.printsStudentSlip])), count: rows.length }
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  if (result == null) throw new Error('fixture did not run')
  return result
}

const once = migrate(1)

describe('20261202090000_part_preset_student_slip', () => {
  it('switches the slip on for the three seeded student kinds', async () => {
    const { after } = await once
    expect(after['bible-reading']).toBe(true)
    expect(after['school-demonstration']).toBe(true)
    expect(after['school-talk']).toBe(true)
  })

  it('leaves every other kind without it, seeded or the congregation’s own', async () => {
    const { after } = await once
    expect(after['midweek-talk']).toBe(false)
    expect(after.prayer).toBe(false)
    expect(after['school-talk-2']).toBe(false)
    expect(after['exposé-perso']).toBe(false)
  })

  it('gives the same result when run twice', async () => {
    const [first, second] = await Promise.all([once, migrate(2)])
    expect(second).toEqual(first)
    expect(first.count).toBe(7)
  })
})
