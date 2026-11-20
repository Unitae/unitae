import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner. Its statements are read from
// the shipped file and run inside a rolled-back transaction.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

const STATEMENTS = readFileSync(join(import.meta.dirname, '20261120090000_add_absences', 'migration.sql'), 'utf8')
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement.length > 0)

class Rollback extends Error {}

interface AbsenceRow {
  legacyEventId: number | null
  startDate: Date
  endDate: Date
  note: string
  memberId: number | null
  accountId: number | null
  createdAt: Date
}

interface Result {
  ids: Record<string, number>
  first: AbsenceRow[]
  second: AbsenceRow[]
  /** The other congregation's rows after both runs, by event: its own absence, and nothing for the stray one. */
  otherCongregation: { legacyEventId: number | null; congregationId: number }[]
  ownerlessRefused: boolean
}

let memo: Promise<Result> | undefined

/**
 * Day-off events as the previous image leaves them, at the moment the migration runs: some declared from an account
 * with a record, one from an account without, a meeting that is no absence, and one absence already copied — then a
 * new absence declared before the second run.
 */
function snapshot(): Promise<Result> {
  memo ??= (async () => {
    let result: Result | undefined
    try {
      await testDb.$transaction(async tx => {
        // 20261123090000_drop_absence_legacy_event_id dropped the column this migration writes: a stand-in, with its
        // unique index (ON CONFLICT targets it), for this rolled-back transaction only. A no-op where it still exists.
        await tx.$executeRawUnsafe('ALTER TABLE "Absence" ADD COLUMN IF NOT EXISTS "legacyEventId" INTEGER')
        await tx.$executeRawUnsafe(
          'CREATE UNIQUE INDEX IF NOT EXISTS "Absence_legacyEventId_key" ON "Absence"("legacyEventId")',
        )
        const stamp = `absences-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        const dayOff = await tx.eventTemplate.create({ data: { name: 'Absence', key: 'day-off', congregationId } })
        const meeting = await tx.eventTemplate.create({
          data: { name: 'Réunion', key: `midweek-${stamp}`, congregationId },
        })
        const member = await tx.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })
        const withRecord = await tx.userAccount.create({
          data: { email: `paul-${stamp}@test.com`, password: 'x', memberId: member.id, congregationId },
        })
        const withoutRecord = await tx.userAccount.create({
          data: { email: `sans-${stamp}@test.com`, password: 'x', congregationId },
        })
        const event = (
          templateId: number,
          createdById: number | null,
          day: string,
          description = '',
          inCongregation = congregationId,
        ) =>
          tx.event.create({
            data: {
              name: 'Absence',
              description,
              startDate: new Date(`${day}T00:00:00Z`),
              endDate: new Date(`${day}T23:59:00Z`),
              status: 'released',
              templateId,
              createdById,
              createdAt: new Date('2026-10-01T08:00:00Z'),
              congregationId: inCongregation,
            },
          })
        // Another congregation, with its own absence template and one genuine absence.
        const otherId = (
          await tx.congregation.create({ data: { name: `${stamp}-b`, slug: `${stamp}-b`, active: true } })
        ).id
        const otherDayOff = await tx.eventTemplate.create({
          data: { name: 'Absence', key: 'day-off', congregationId: otherId },
        })
        const otherAccount = await tx.userAccount.create({
          data: { email: `autre-${stamp}@test.com`, password: 'x', congregationId: otherId },
        })

        const ids: Record<string, number> = {
          withRecord: (await event(dayOff.id, withRecord.id, '2027-01-04', 'Vacances')).id,
          withoutRecord: (await event(dayOff.id, withoutRecord.id, '2027-01-11')).id,
          meeting: (await event(meeting.id, withRecord.id, '2027-01-12')).id,
          copied: (await event(dayOff.id, withRecord.id, '2027-02-01')).id,
          // No author: it would break the CHECK, so it is left out (no path leaves one today).
          noAuthor: (await event(dayOff.id, null, '2027-02-08')).id,
          // An event of this congregation pointing at the other one's absence template: not an absence here.
          stray: (await event(otherDayOff.id, withRecord.id, '2027-02-15')).id,
          otherAbsence: (await event(otherDayOff.id, otherAccount.id, '2027-02-22', '', otherId)).id,
          otherCongregation: otherId,
          member: member.id,
          withRecordAccount: withRecord.id,
          withoutRecordAccount: withoutRecord.id,
        }
        // Copied already, with a note of its own: a run neither doubles nor overwrites it. legacyEventId is out of the
        // client (@ignore): this test reads and writes it in SQL, as the migration does.
        await tx.$executeRaw`
          INSERT INTO "Absence" ("startDate", "endDate", "note", "accountId", "legacyEventId", "congregationId")
          VALUES ('2027-02-01T00:00:00Z', '2027-02-01T23:59:00Z', 'déjà là', ${withRecord.id}, ${ids.copied},
                  ${congregationId})`

        const read = () =>
          tx.$queryRaw<AbsenceRow[]>`
            SELECT "legacyEventId", "startDate", "endDate", "note", "memberId", "accountId", "createdAt"
            FROM "Absence" WHERE "congregationId" = ${congregationId} ORDER BY "legacyEventId" ASC`

        for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
        const first = await read()
        // Declared by the previous image after the first run: no Absence row of its own yet.
        ids.late = (await event(dayOff.id, withoutRecord.id, '2027-03-01')).id
        for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
        const second = await read()

        let ownerlessRefused = false
        try {
          await tx.$executeRawUnsafe('SAVEPOINT ownerless')
          await tx.$executeRawUnsafe(
            `INSERT INTO "Absence" ("startDate", "endDate", "congregationId") VALUES (now(), now(), ${congregationId})`,
          )
        } catch {
          ownerlessRefused = true
        } finally {
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ownerless')
        }

        const otherCongregation = await tx.$queryRaw<{ legacyEventId: number | null; congregationId: number }[]>`
          SELECT "legacyEventId", "congregationId" FROM "Absence"
          WHERE "legacyEventId" IN (${ids.stray}, ${ids.otherAbsence})`
        result = { ids, first, second, otherCongregation, ownerlessRefused }
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    return result as Result
  })()
  return memo
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('20261120090000_add_absences', () => {
  it('copies every day-off once, as it is, with its owner’s record when the account has one', async () => {
    const { ids, first } = await snapshot()

    expect(first).toEqual([
      {
        legacyEventId: ids.withRecord,
        startDate: new Date('2027-01-04T00:00:00Z'),
        endDate: new Date('2027-01-04T23:59:00Z'),
        note: 'Vacances',
        memberId: ids.member,
        accountId: ids.withRecordAccount,
        createdAt: new Date('2026-10-01T08:00:00Z'),
      },
      {
        legacyEventId: ids.withoutRecord,
        startDate: new Date('2027-01-11T00:00:00Z'),
        endDate: new Date('2027-01-11T23:59:00Z'),
        note: '',
        memberId: null,
        accountId: ids.withoutRecordAccount,
        createdAt: new Date('2026-10-01T08:00:00Z'),
      },
      expect.objectContaining({ legacyEventId: ids.copied, note: 'déjà là', memberId: null }),
    ])
  })

  it('leaves out an event that is no absence', async () => {
    const { ids, first } = await snapshot()

    expect(first.map(row => row.legacyEventId)).not.toContain(ids.meeting)
  })

  it('copies on a second run only the absences declared since', async () => {
    const { ids, first, second } = await snapshot()

    expect(second).toEqual([...first, expect.objectContaining({ legacyEventId: ids.late, memberId: null })])
  })

  it('refuses an absence that is nobody’s', async () => {
    const { ownerlessRefused } = await snapshot()

    expect(ownerlessRefused).toBe(true)
  })

  it('isolates absences by congregation', async () => {
    const rows = await testDb.$queryRaw<{ forced: boolean; policies: bigint }[]>`
      SELECT c.relforcerowsecurity AS forced,
             (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = 'Absence' AND p.policyname = 'tenant_isolation') AS policies
      FROM pg_class c WHERE c.relname = 'Absence'`
    expect(rows).toEqual([{ forced: true, policies: 1n }])
  })

  it('leaves out an absence without an author, and an event pointing at another congregation’s template', async () => {
    const { ids, second } = await snapshot()
    const copied = second.map(row => row.legacyEventId)

    expect(copied).not.toContain(ids.noAuthor)
    expect(copied).not.toContain(ids.stray)
  })

  it('copies the other congregation’s absence under that congregation', async () => {
    const { ids, otherCongregation } = await snapshot()

    expect(otherCongregation).toEqual([{ legacyEventId: ids.otherAbsence, congregationId: ids.otherCongregation }])
  })
})
