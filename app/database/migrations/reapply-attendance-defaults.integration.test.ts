import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner. Its statements are read from
// the shipped file and run inside a rolled-back transaction.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

const STATEMENTS = readFileSync(
  join(import.meta.dirname, '20261117090000_reapply_attendance_defaults', 'migration.sql'),
  'utf8',
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement.length > 0)

class Rollback extends Error {}

interface Row {
  name: string
  attendanceKind: string
  isRecurring: boolean
}

async function snapshot(): Promise<{ first: Row[]; second: Row[] }> {
  let result: { first: Row[]; second: Row[] } | undefined
  try {
    await testDb.$transaction(async tx => {
      const stamp = `reapply-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregation = await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })
      const finished = await tx.$queryRaw<{ finished_at: Date }[]>`
        SELECT "finished_at" FROM "_prisma_migrations" WHERE "migration_name" = '20261116120000_add_meeting_attendance'`
      const after = new Date((finished[0]?.finished_at ?? new Date()).getTime() + 60_000)
      const before = new Date('2020-01-01T00:00:00Z')
      const template = (name: string, key: string, createdAt: Date, updatedAt: Date, extra: object = {}) =>
        tx.eventTemplate.create({
          data: { name, key, createdAt, updatedAt, congregationId: congregation.id, attendanceKind: 'none', ...extra },
        })
      // Seeded by the old image during the window: repaired.
      await template('a-window-midweek', 'midweek-meeting', after, after, { weekDay: 4 })
      await template('b-window-memorial', 'memorial', after, after)
      // A template that existed before: the first migration already decided it, leave it.
      await template('c-old-weekend', 'weekend-meeting', before, before, { weekDay: 6 })
      // Not a seeded key: stays not counted.
      await template('d-window-other', 'field-service', after, after, { weekDay: 3 })

      const read = () =>
        tx.eventTemplate.findMany({
          where: { congregationId: congregation.id },
          select: { name: true, attendanceKind: true, isRecurring: true },
          orderBy: { name: 'asc' },
        })
      for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
      const first = await read()
      for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
      result = { first, second: await read() }
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  return result as { first: Row[]; second: Row[] }
}

async function editedSnapshot(): Promise<string | undefined> {
  let kind: string | undefined
  try {
    await testDb.$transaction(async tx => {
      const stamp = `reapply-edit-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregation = await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })
      const created = new Date(Date.now() + 60_000)
      // A manager set it to « Non comptée » a day after it was created: their choice stands.
      const template = await tx.eventTemplate.create({
        data: {
          name: stamp,
          key: 'weekend-meeting',
          attendanceKind: 'none',
          createdAt: created,
          updatedAt: new Date(created.getTime() + 24 * 60 * 60 * 1000),
          congregationId: congregation.id,
        },
      })
      for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
      kind = (await tx.eventTemplate.findFirst({ where: { id: template.id } }))?.attendanceKind
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  return kind
}

let memo: ReturnType<typeof snapshot> | undefined
const rows = () => {
  memo ??= snapshot()
  return memo
}

describe('20261117090000_reapply_attendance_defaults', () => {
  afterAll(async () => {
    await testDb.$disconnect()
  })

  it('ships its two statements', () => {
    expect(STATEMENTS).toHaveLength(2)
  })

  it('counts the seeded meetings created in the deploy window, and nothing else', async () => {
    const { first } = await rows()
    expect(first.map(row => [row.name, row.attendanceKind])).toEqual([
      ['a-window-midweek', 'midweek'],
      ['b-window-memorial', 'separate'],
      ['c-old-weekend', 'none'],
      ['d-window-other', 'none'],
    ])
  })

  it('realigns isRecurring with the weekday', async () => {
    const { first } = await rows()
    expect(Object.fromEntries(first.map(row => [row.name, row.isRecurring]))).toMatchObject({
      'a-window-midweek': true,
      'b-window-memorial': false,
    })
  })

  it('changes nothing when run twice', async () => {
    const { first, second } = await rows()
    expect(second).toEqual(first)
  })

  it('keeps a « Non comptée » a manager chose after creating the template', async () => {
    expect(await editedSnapshot()).toBe('none')
  })
})
