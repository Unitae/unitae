import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { type ItemTables, readNewItems, readOldItems } from '~/tests/helpers/item-mirror'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner. Its tables, functions and
// triggers are already applied (CI migrates first). Only the statements after the `-- backfill` marker are replayed,
// inside a rolled-back transaction: the function bodies above it hold semicolons a plain split would cut through.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

const SQL = readFileSync(join(import.meta.dirname, '20261125090000_add_items', 'migration.sql'), 'utf8')
const MARKER = '\n-- backfill'
const BACKFILL = SQL.slice(SQL.indexOf(MARKER))
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement.length > 0)

const INSERT_COLUMNS = /INSERT INTO "\w+" \(([^)]*)\)/
const REFRESHED_COLUMNS = /DO UPDATE SET([\s\S]*?);/
const DATA_WRITE = /^(INSERT INTO|DELETE FROM)\b/

/** Each trigger function's INSERT column list and the columns its ON CONFLICT refreshes. */
function triggerColumnLists() {
  const lists: Record<string, { inserted: string[]; refreshed: string[] }> = {}
  for (const [, name, body] of SQL.matchAll(/FUNCTION "(mirror_\w+)"\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/g)) {
    const insert = body.match(INSERT_COLUMNS)
    const update = body.match(REFRESHED_COLUMNS)
    if (!insert || !update) continue
    lists[name] = {
      inserted: insert[1].split(',').map(column => column.trim()),
      refreshed: [...update[1].matchAll(/("\w+") = EXCLUDED/g)].map(match => match[1]),
    }
  }
  return lists
}

class Rollback extends Error {}

interface Result {
  /** The old tables, read once the fixture is written. */
  old: ItemTables
  /** The new tables as the triggers left them. */
  mirrored: ItemTables
  /** Rows left in the new tables once emptied, before the backfill runs. */
  emptied: number
  /** The new tables once filled by the backfill. */
  backfilled: ItemTables
  /** The same, after a second run. */
  rerun: ItemTables
  /** After a stale copy, a lost allowed role and stray rows the old tables do not have, before the backfill again. */
  damaged: ItemTables
  /** The same, once the backfill ran again. */
  repaired: ItemTables
  ids: { member: number; reader: number; speakerRole: number; readerRole: number; speaker: number }
}

let memo: Promise<Result> | undefined

/**
 * A template with a part and a service, an event made from it with both, a custom part, every slot of allowed roles.
 * Every compared column holds a value of its own somewhere, so a column copied into another one shows.
 */
function snapshot(): Promise<Result> {
  memo ??= (async () => {
    let result: Result | undefined
    try {
      await testDb.$transaction(async tx => {
        const stamp = `items-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        const speakerRole = await tx.role.create({ data: { key: `speaker-${stamp}`, name: 'speaker', congregationId } })
        const readerRole = await tx.role.create({ data: { key: `reader-${stamp}`, name: 'reader', congregationId } })
        const member = await tx.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })
        const reader = await tx.member.create({ data: { firstname: 'Luc', lastname: 'ROUX', congregationId } })
        const speaker = await tx.externalSpeaker.create({ data: { name: 'Jean DURAND', congregationId } })
        const preset = await tx.partPreset.create({ data: { key: `reading-${stamp}`, congregationId } })
        const servicePreset = await tx.partPreset.create({
          data: { key: `sound-${stamp}`, scope: 'service', congregationId },
        })
        const template = await tx.eventTemplate.create({
          data: { name: 'Réunion de semaine', key: `midweek-${stamp}`, congregationId },
        })
        const programmeTemplate = await tx.scheduleTemplate.create({
          data: { name: 'Réunion de semaine', kind: 'programme', congregationId },
        })
        const dutyTemplate = await tx.scheduleTemplate.create({
          data: { key: 'services', kind: 'duty', congregationId },
        })
        const part = await tx.templatePart.create({
          data: {
            name: 'Lecture',
            section: 'Joyaux',
            track: 'Salle B',
            trackOrder: 3,
            order: 2,
            durationMin: 4,
            allowExternalSpeaker: true,
            speakerLabel: 'Étudiant',
            readerLabel: 'Lecteur',
            templateId: template.id,
            scheduleTemplateId: programmeTemplate.id,
            presetId: preset.id,
            congregationId,
            allowedRoles: {
              create: [
                { roleId: speakerRole.id, asKind: 'speaker', congregationId },
                { roleId: readerRole.id, asKind: 'reader', congregationId },
              ],
            },
          },
        })
        const service = await tx.templateServicePart.create({
          data: {
            name: 'Sono',
            key: `sound-${stamp}`,
            order: 1,
            templateId: template.id,
            scheduleTemplateId: dutyTemplate.id,
            presetId: servicePreset.id,
            congregationId,
            allowedRoles: { create: [{ roleId: speakerRole.id, congregationId }] },
          },
        })
        const event = await tx.event.create({
          data: {
            name: 'Réunion',
            startDate: new Date('2026-12-03T18:00:00Z'),
            endDate: new Date('2026-12-03T19:45:00Z'),
            templateId: template.id,
            congregationId,
          },
        })
        const programme = await tx.schedule.create({
          data: { eventId: event.id, name: 'Réunion de semaine', kind: 'programme', congregationId },
        })
        const duties = await tx.schedule.create({
          data: { eventId: event.id, key: 'services', kind: 'duty', order: 1, congregationId },
        })
        await tx.eventPart.create({
          data: {
            name: 'Lecture',
            topic: 'Matthieu 5',
            note: 'Verset 3',
            section: 'Joyaux',
            track: 'Salle B',
            trackOrder: 3,
            order: 2,
            durationMin: 4,
            speakerLabel: 'Étudiant',
            readerLabel: 'Lecteur',
            eventId: event.id,
            scheduleId: programme.id,
            partId: part.id,
            presetId: preset.id,
            assigneeId: member.id,
            assistantId: reader.id,
            allowExternalSpeaker: true,
            externalSpeakerId: speaker.id,
            hasConflict: true,
            congregationId,
            allowedRoles: {
              create: [
                { roleId: speakerRole.id, asKind: 'speaker', congregationId },
                { roleId: readerRole.id, asKind: 'reader', congregationId },
              ],
            },
          },
        })
        await tx.eventPart.create({ data: { name: 'Annonces', eventId: event.id, congregationId } })
        await tx.eventServicePart.create({
          data: {
            name: 'Sono',
            note: 'Micro 2',
            order: 1,
            hasConflict: true,
            eventId: event.id,
            scheduleId: duties.id,
            servicePartId: service.id,
            presetId: servicePreset.id,
            assigneeId: member.id,
            congregationId,
            allowedRoles: { create: [{ roleId: speakerRole.id, congregationId }] },
          },
        })

        const old = await readOldItems(tx, congregationId)
        const mirrored = await readNewItems(tx, congregationId)

        // As before the triggers existed: the new tables empty, the old ones full.
        await tx.$executeRawUnsafe('DELETE FROM "Item" WHERE "congregationId" = $1', congregationId)
        await tx.$executeRawUnsafe('DELETE FROM "TemplateItem" WHERE "congregationId" = $1', congregationId)
        const [{ count: emptied }] = await tx.$queryRawUnsafe<{ count: number }[]>(
          `SELECT ((SELECT COUNT(*) FROM "Item" WHERE "congregationId" = $1)
             + (SELECT COUNT(*) FROM "TemplateItem" WHERE "congregationId" = $1))::int AS "count"`,
          congregationId,
        )
        const backfill = async () => {
          for (const statement of BACKFILL) await tx.$executeRawUnsafe(statement)
          return readNewItems(tx, congregationId)
        }
        const backfilled = await backfill()
        const rerun = await backfill()

        // A stale copy, a lost allowed role, and rows the old tables do not have: an allowed role in a slot a duty has
        // no use for, an item and a template item whose old row is gone.
        await tx.$executeRawUnsafe(
          `UPDATE "Item" SET "name" = 'stale', "assigneeId" = NULL WHERE "congregationId" = $1 AND "legacyServiceId" IS NOT NULL`,
          congregationId,
        )
        await tx.$executeRawUnsafe(
          `DELETE FROM "ItemAllowedRole" WHERE "congregationId" = $1 AND "slot" = 'second'`,
          congregationId,
        )
        await tx.$executeRawUnsafe(
          `INSERT INTO "ItemAllowedRole" ("itemId", "roleId", "slot", "congregationId")
           SELECT "id", $2, 'second', $1 FROM "Item" WHERE "congregationId" = $1 AND "legacyServiceId" IS NOT NULL`,
          congregationId,
          readerRole.id,
        )
        await tx.$executeRawUnsafe(
          `INSERT INTO "Item" ("eventId", "updatedAt", "legacyPartId", "congregationId")
           VALUES ($2, CURRENT_TIMESTAMP, 2147483647, $1)`,
          congregationId,
          event.id,
        )
        await tx.$executeRawUnsafe(
          `INSERT INTO "TemplateItem" ("name", "legacyServiceId", "congregationId") VALUES ('Parti', 2147483647, $1)`,
          congregationId,
        )
        const damaged = await readNewItems(tx, congregationId)
        const repaired = await backfill()

        result = {
          old,
          mirrored,
          emptied,
          backfilled,
          rerun,
          damaged,
          repaired,
          ids: {
            member: member.id,
            reader: reader.id,
            speakerRole: speakerRole.id,
            readerRole: readerRole.id,
            speaker: speaker.id,
          },
        }
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (!result) throw new Error('the fixture never ran')
    return result
  })()
  return memo
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('add_items migration', () => {
  it('reads a fixture with every kind of row, every slot and every column filled', async () => {
    const { old, ids } = await snapshot()

    expect(old.templateItems).toHaveLength(2)
    expect(old.items).toHaveLength(3)
    expect(old.items).toContainEqual(
      expect.objectContaining({
        name: 'Lecture',
        assigneeId: ids.member,
        assistantId: ids.reader,
        externalSpeakerId: ids.speaker,
      }),
    )
    for (const roles of [old.itemRoles, old.templateItemRoles]) {
      expect(roles).toHaveLength(3)
      expect(roles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ roleId: ids.readerRole, slot: 'second' }),
          expect.objectContaining({ roleId: ids.speakerRole, slot: 'main' }),
        ]),
      )
    }
    // No compared column stays empty in every row, or a copy into the wrong column would pass unseen.
    for (const rows of [old.templateItems, old.items]) {
      for (const column of Object.keys(rows[0])) {
        expect(
          rows.some(row => row[column] !== null && row[column] !== '' && row[column] !== false),
          column,
        ).toBe(true)
      }
    }
  })

  it('mirrors every write of the old tables through the triggers', async () => {
    const { old, mirrored } = await snapshot()

    expect(mirrored).toEqual(old)
  })

  it('copies what exists into empty tables, and changes nothing on a second run', async () => {
    const { old, emptied, backfilled, rerun } = await snapshot()

    expect(emptied).toBe(0)
    expect(backfilled).toEqual(old)
    expect(rerun).toEqual(old)
  })

  it('refreshes a stale copy, restores a lost role and removes what has no old row on a re-run', async () => {
    const { old, damaged, repaired } = await snapshot()

    expect(damaged.items).toHaveLength(old.items.length + 1)
    expect(damaged.templateItems).toHaveLength(old.templateItems.length + 1)
    expect(damaged.itemRoles).not.toEqual(old.itemRoles)
    expect(damaged.items).toContainEqual(expect.objectContaining({ name: 'stale' }))
    expect(repaired).toEqual(old)
  })

  it('refreshes every inserted column on conflict, in every trigger', () => {
    const lists = triggerColumnLists()
    const immutable = ['"createdAt"', '"legacyPartId"', '"legacyServiceId"']

    expect(Object.keys(lists).sort()).toEqual([
      'mirror_event_part',
      'mirror_event_service_part',
      'mirror_template_part',
      'mirror_template_service_part',
    ])
    for (const { inserted, refreshed } of Object.values(lists)) {
      expect(refreshed.sort()).toEqual(inserted.filter(column => !immutable.includes(column)).sort())
    }
  })

  it('isolates the four tables by congregation', async () => {
    const rows = await testDb.$queryRaw<{ relname: string; forced: boolean; policies: bigint }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced,
             (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policies
      FROM pg_class c
      WHERE c.relname IN ('TemplateItem', 'TemplateItemAllowedRole', 'Item', 'ItemAllowedRole') AND c.relkind = 'r'
      ORDER BY c.relname`
    expect(rows).toEqual(
      ['Item', 'ItemAllowedRole', 'TemplateItem', 'TemplateItemAllowedRole'].map(relname => ({
        relname,
        forced: true,
        policies: 1n,
      })),
    )
  })

  it('keeps every data write after the marker, none cut by the split', () => {
    expect(SQL.split(MARKER)).toHaveLength(2)
    expect(BACKFILL).toHaveLength(16)
    expect(BACKFILL.every(statement => DATA_WRITE.test(statement))).toBe(true)
  })
})
