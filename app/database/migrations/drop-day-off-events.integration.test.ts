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
  join(import.meta.dirname, '20261121090000_drop_day_off_events', 'migration.sql'),
  'utf8',
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement.length > 0)

class Rollback extends Error {}

interface Snapshot {
  /** How many absences the congregation has: a duplicate would not show in `absences`, which is keyed by case. */
  count: number
  /** Each absence by the name of the fixture case it stands for, with its record, account and event. */
  absences: Record<string, { memberId: number | null; accountId: number | null; legacyEventId: number | null }>
  /** The events left, by name. */
  events: string[]
  /** The templates left, by key. */
  templates: string[]
}

interface Result {
  ids: Record<string, number>
  first: Snapshot
  second: Snapshot
  /** The other congregation's day-off templates, events and absences after both runs. */
  otherCongregation: { templates: number; events: number; absences: number }
}

let memo: Promise<Result> | undefined

/**
 * A congregation as the version before this one leaves it: absences written both ways, a day-off an older version
 * wrote alone, rows kept on a record after their login was deleted or written without an event, a copy whose absence
 * an older version cancelled by deleting the event alone, a day-off without its author, one with a part, and a meeting.
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
        const stamp = `drop-day-off-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        const dayOff = await tx.eventTemplate.create({ data: { name: 'Absence', key: 'day-off', congregationId } })
        const meetingTemplate = await tx.eventTemplate.create({
          data: { name: 'Réunion', key: `midweek-${stamp}`, congregationId },
        })
        const member = await tx.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })
        const account = await tx.userAccount.create({
          data: { email: `paul-${stamp}@test.com`, password: 'x', memberId: member.id, congregationId },
        })
        const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
        const event = (name: string, templateId: number, createdById: number | null, iso: string) =>
          tx.event.create({
            data: {
              name,
              description: name,
              startDate: day(iso),
              endDate: day(iso),
              status: 'released',
              templateId,
              createdById,
              createdAt: new Date('2026-10-01T08:00:00Z'),
              congregationId,
            },
          })
        // legacyEventId is out of the client (@ignore): written and read in SQL, as the migration does.
        const row = (name: string, data: { memberId?: number; accountId?: number; legacyEventId?: number }) =>
          tx.$executeRaw`
            INSERT INTO "Absence" ("startDate", "endDate", "note", "memberId", "accountId", "legacyEventId", "congregationId")
            VALUES (${day('2027-01-04')}, ${day('2027-01-05')}, ${name}, ${data.memberId ?? null}, ${data.accountId ?? null},
                    ${data.legacyEventId ?? null}, ${congregationId})`
        // An id no event has any more: what deleting an event leaves.
        const goneEventId = async () => {
          const gone = await event('gone', meetingTemplate.id, null, '2027-01-01')
          await tx.event.delete({ where: { id: gone.id } })
          return gone.id
        }

        const ids: Record<string, number> = { member: member.id, account: account.id }
        // Written both ways, as createDayOff did.
        ids.dual = (await event('dual', dayOff.id, account.id, '2027-01-04')).id
        await row('dual', { memberId: member.id, accountId: account.id, legacyEventId: ids.dual })
        // Written alone by a version before the absences table, during its rollout.
        ids.uncopied = (await event('uncopied', dayOff.id, account.id, '2027-01-11')).id
        // Kept on the record after the login that declared it was deleted (its event went then).
        ids.keptEvent = await goneEventId()
        await row('kept', { memberId: member.id, legacyEventId: ids.keptEvent })
        // Written alone by a version with no day-off template.
        await row('alone', { memberId: member.id, accountId: account.id })
        // A copy whose absence an older version cancelled by deleting the event alone.
        await row('cancelled', { memberId: member.id, accountId: account.id, legacyEventId: await goneEventId() })
        // A day-off without its author: nobody's absence, which no path leaves.
        await event('authorless', dayOff.id, null, '2027-01-18')
        // A day-off with a part on it, which no path leaves either: left as it is, with its template.
        ids.withPart = (await event('with part', dayOff.id, account.id, '2027-01-25')).id
        await row('with part', { memberId: member.id, accountId: account.id, legacyEventId: ids.withPart })
        await tx.eventPart.create({ data: { name: 'Lecture', eventId: ids.withPart, congregationId } })
        // The same with a service, and with attendance counts.
        for (const [name, iso] of [
          ['with service', '2027-02-01'],
          ['with attendance', '2027-02-08'],
        ] as const) {
          ids[name] = (await event(name, dayOff.id, account.id, iso)).id
          await row(name, { memberId: member.id, accountId: account.id, legacyEventId: ids[name] })
        }
        await tx.eventServicePart.create({ data: { name: 'Sono', eventId: ids['with service'], congregationId } })
        await tx.attendance.create({ data: { eventId: ids['with attendance'], inPerson: 40, congregationId } })
        // Written alone by an older version, by an account without a record: its absence is the account's.
        const loner = await tx.userAccount.create({
          data: { email: `sans-${stamp}@test.com`, password: 'x', congregationId },
        })
        ids.loner = loner.id
        ids.lonerDayOff = (await event('uncopied without record', dayOff.id, loner.id, '2027-02-15')).id
        // A meeting: not an absence.
        await event('meeting', meetingTemplate.id, account.id, '2027-01-12')

        // Another congregation, with a day-off template of its own and a day-off written both ways.
        const otherId = (
          await tx.congregation.create({ data: { name: `${stamp}-b`, slug: `${stamp}-b`, active: true } })
        ).id
        const otherDayOff = await tx.eventTemplate.create({
          data: { name: 'Absence', key: 'day-off', congregationId: otherId },
        })
        const otherAccount = await tx.userAccount.create({
          data: { email: `autre-${stamp}@test.com`, password: 'x', congregationId: otherId },
        })
        const otherEvent = await tx.event.create({
          data: {
            name: 'other',
            startDate: day('2027-02-01'),
            endDate: day('2027-02-01'),
            templateId: otherDayOff.id,
            createdById: otherAccount.id,
            congregationId: otherId,
          },
        })
        await tx.$executeRaw`
          INSERT INTO "Absence" ("startDate", "endDate", "accountId", "legacyEventId", "congregationId")
          VALUES (${day('2027-02-01')}, ${day('2027-02-01')}, ${otherAccount.id}, ${otherEvent.id}, ${otherId})`

        const read = async (): Promise<Snapshot> => {
          const absences = await tx.$queryRaw<
            { note: string; memberId: number | null; accountId: number | null; legacyEventId: number | null }[]
          >`SELECT "note", "memberId", "accountId", "legacyEventId" FROM "Absence" WHERE "congregationId" = ${congregationId}`
          const events = await tx.event.findMany({ where: { congregationId }, select: { name: true } })
          const templates = await tx.eventTemplate.findMany({ where: { congregationId }, select: { key: true } })
          return {
            count: absences.length,
            absences: Object.fromEntries(absences.map(({ note, ...rest }) => [note, rest] as const)),
            events: events.map(e => e.name).sort(),
            templates: templates.map(t => (t.key === 'day-off' ? 'day-off' : 'meeting')).sort(),
          }
        }

        for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
        const first = await read()
        for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
        const second = await read()

        const otherCongregation = {
          templates: await tx.eventTemplate.count({ where: { congregationId: otherId, key: 'day-off' } }),
          events: await tx.event.count({ where: { congregationId: otherId } }),
          absences: await tx.absence.count({ where: { congregationId: otherId } }),
        }
        result = { ids, first, second, otherCongregation }
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

describe('20261121090000_drop_day_off_events', () => {
  it('copies the day-off an older version wrote alone, on its author’s record, before the event goes', async () => {
    const { ids, first } = await snapshot()

    expect(first.absences.uncopied).toEqual({
      memberId: ids.member,
      accountId: ids.account,
      legacyEventId: ids.uncopied,
    })
  })

  it('keeps every absence that is someone’s: written both ways, kept on a record, written alone', async () => {
    const { ids, first } = await snapshot()

    expect(first.absences.dual).toEqual({ memberId: ids.member, accountId: ids.account, legacyEventId: ids.dual })
    expect(first.absences.kept).toEqual({ memberId: ids.member, accountId: null, legacyEventId: ids.keptEvent })
    expect(first.absences.alone).toEqual({ memberId: ids.member, accountId: ids.account, legacyEventId: null })
  })

  // Nothing tells it from a kept absence, nor, on a second run, from one whose event the first run deleted: it stays,
  // and its person can cancel it again.
  it('keeps the copy whose absence an older version cancelled by deleting its event', async () => {
    const { first } = await snapshot()

    expect(first.absences.cancelled).toMatchObject({ accountId: first.absences.dual.accountId })
  })

  it('deletes the day-off events and their template, and leaves the meeting', async () => {
    const { ids, first } = await snapshot()

    // A day-off with a part, a service or attendance is left as it is, with its template: deleting it would take them.
    expect(first.events).toEqual(['meeting', 'with attendance', 'with part', 'with service'])
    expect(first.templates).toEqual(['day-off', 'meeting'])
    expect(first.absences['with part']).toEqual({
      memberId: ids.member,
      accountId: ids.account,
      legacyEventId: ids.withPart,
    })
    // Every absence, and no more: the authorless day-off left none.
    expect(first.count).toBe(9)
    expect(Object.keys(first.absences)).not.toContain('authorless')
  })

  it('copies a day-off by an account without a record onto the account', async () => {
    const { ids, first } = await snapshot()

    expect(first.absences['uncopied without record']).toEqual({
      memberId: null,
      accountId: ids.loner,
      legacyEventId: ids.lonerDayOff,
    })
  })

  it('deletes another congregation’s day-off events and template too, keeping its absence', async () => {
    const { otherCongregation } = await snapshot()

    expect(otherCongregation).toEqual({ templates: 0, events: 0, absences: 1 })
  })

  // A table added later that cascades from Event would be deleted with a day-off that has rows in it, unless guarded.
  // Schedule and Item are the exceptions: add_schedules (20261124090000) and add_items (20261125090000) run after this
  // migration, so neither exists when it does; a schedule only holds parts and services, which are guarded, and an item
  // only mirrors one of them.
  it('guards every table that cascades from an event', async () => {
    const cascading = await testDb.$queryRaw<{ table_name: string }[]>`
      SELECT DISTINCT tc.table_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'Event' AND rc.delete_rule = 'CASCADE'
        AND tc.table_name NOT IN ('Event', 'Schedule', 'Item')`
    const sql = STATEMENTS.join(';')

    expect(cascading.length).toBeGreaterThan(0)
    for (const { table_name } of cascading) {
      expect(sql, table_name).toContain(`NOT EXISTS (SELECT 1 FROM "${table_name}"`)
    }
  })

  it('changes nothing when run twice', async () => {
    const { first, second } = await snapshot()

    expect(second).toEqual(first)
  })
})
