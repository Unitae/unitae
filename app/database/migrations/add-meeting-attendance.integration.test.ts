import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

// The DDL is asserted against the applied database (CI runs `prisma migrate deploy` first); only the data statements —
// the backfills — are re-executed, from the shipped file, so an edit to it cannot leave this test passing.
const SQL = readFileSync(join(import.meta.dirname, '20261116120000_add_meeting_attendance', 'migration.sql'), 'utf8')
const BACKFILLS = SQL.split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement.startsWith('UPDATE'))

const KIND_CHECK = /EventTemplate_attendanceKind_check/
const COUNTS_CHECK = /Attendance_counts_check/

/** Thrown to unwind the fixture; every assertion runs on values captured before it. */
class Rollback extends Error {}

interface TemplateRow {
  key: string
  attendanceKind: string
  isRecurring: boolean
}

interface Snapshot {
  first: TemplateRow[]
  second: TemplateRow[]
}

async function backfillSnapshot(): Promise<Snapshot> {
  let snapshot: Snapshot | undefined
  try {
    await testDb.$transaction(async tx => {
      const stamp = `attendance-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregation = await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })
      const template = (key: string, weekDay: number | null, isRecurring: boolean) =>
        tx.eventTemplate.create({ data: { name: key, key, weekDay, isRecurring, congregationId: congregation.id } })
      await template('midweek-meeting', 2, true)
      await template('weekend-meeting', 6, true)
      await template('memorial', null, false)
      // A key the migration has never heard of keeps the default.
      await template('field-service', 3, true)
      // isRecurring drifted the two ways updateTemplate allowed.
      await template('weekday-added-later', 4, false)
      await template('weekday-cleared-later', null, true)
      // A congregation that already chose a kind keeps it.
      await tx.eventTemplate.create({
        data: {
          name: 'custom',
          key: 'custom-weekend',
          weekDay: 0,
          attendanceKind: 'weekend',
          congregationId: congregation.id,
        },
      })

      const read = () =>
        tx.eventTemplate.findMany({
          where: { congregationId: congregation.id },
          select: { key: true, attendanceKind: true, isRecurring: true },
          orderBy: { key: 'asc' },
        })
      for (const statement of BACKFILLS) await tx.$executeRawUnsafe(statement)
      const first = await read()
      for (const statement of BACKFILLS) await tx.$executeRawUnsafe(statement)
      snapshot = { first, second: await read() }
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  return snapshot as Snapshot
}

let memo: Promise<Snapshot> | undefined
const snapshot = () => {
  memo ??= backfillSnapshot()
  return memo
}

describe('20261116120000_add_meeting_attendance', () => {
  afterAll(async () => {
    await testDb.$disconnect()
  })

  it('ships the backfills it is supposed to', () => {
    expect(BACKFILLS).toHaveLength(4)
  })

  it('makes the seeded meetings count and leaves every other template at none', async () => {
    const { first } = await snapshot()
    expect(first.map(t => [t.key, t.attendanceKind])).toEqual([
      ['custom-weekend', 'weekend'],
      ['field-service', 'none'],
      ['memorial', 'separate'],
      ['midweek-meeting', 'midweek'],
      ['weekday-added-later', 'none'],
      ['weekday-cleared-later', 'none'],
      ['weekend-meeting', 'weekend'],
    ])
  })

  it('realigns isRecurring with the weekday', async () => {
    const { first } = await snapshot()
    const recurring = Object.fromEntries(first.map(t => [t.key, t.isRecurring]))
    expect(recurring['weekday-added-later']).toBe(true)
    expect(recurring['weekday-cleared-later']).toBe(false)
    expect(recurring.memorial).toBe(false)
  })

  it('changes nothing when run twice', async () => {
    const { first, second } = await snapshot()
    expect(second).toEqual(first)
  })

  it('refuses an attendance kind outside the enumeration', async () => {
    const message = await expectFailure(async tx => {
      const stamp = `attkind-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregation = await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })
      const template = await tx.eventTemplate.create({
        data: { name: stamp, key: stamp, congregationId: congregation.id },
      })
      await tx.$executeRawUnsafe(`UPDATE "EventTemplate" SET "attendanceKind" = 'monthly' WHERE "id" = ${template.id}`)
    })
    expect(message).toMatch(KIND_CHECK)
  })

  // What deleting the account does to the author is 20261122090000_event_author_set_null's (SetNull since).
  it('makes an event’s author optional', async () => {
    const rows = await testDb.$queryRaw<{ is_nullable: string }[]>`
      SELECT is_nullable FROM information_schema.columns WHERE table_name = 'Event' AND column_name = 'createdById'`
    expect(rows).toEqual([{ is_nullable: 'YES' }])
  })

  it('isolates attendance rows by congregation', async () => {
    const rows = await testDb.$queryRaw<{ forced: boolean; policies: bigint }[]>`
      SELECT c.relforcerowsecurity AS forced,
             (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = 'Attendance' AND p.policyname = 'tenant_isolation') AS policies
      FROM pg_class c WHERE c.relname = 'Attendance'`
    expect(rows).toEqual([{ forced: true, policies: 1n }])
  })

  it('refuses a negative count', async () => {
    const message = await expectFailure(async tx => {
      const stamp = `attneg-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregation = await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })
      const event = await tx.event.create({
        data: { name: stamp, startDate: new Date(), endDate: new Date(), congregationId: congregation.id },
      })
      await tx.attendance.create({ data: { eventId: event.id, inPerson: -1, congregationId: congregation.id } })
    })
    expect(message).toMatch(COUNTS_CHECK)
  })
})

async function expectFailure(
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>) => Promise<unknown>,
) {
  try {
    await testDb.$transaction(async tx => {
      await fn(tx)
      throw new Rollback()
    })
  } catch (error) {
    if (error instanceof Rollback) return 'no error'
    return (error as Error).message
  }
  return 'no error'
}
