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

class Rollback extends Error {}

interface Result {
  /** The old tables, read once the fixture is written. */
  old: ItemTables
  /** The new tables as the triggers left them. */
  mirrored: ItemTables
  /** The new tables once emptied and filled by the backfill, then after a second run. */
  backfilled: ItemTables
  rerun: ItemTables
  /** After a stale copy and a lost allowed role, then the backfill again. */
  repaired: ItemTables
  ids: { member: number; reader: number; speakerRole: number; readerRole: number }
}

let memo: Promise<Result> | undefined

/** A template with a part and a service, an event made from it with both, a custom part, every slot of allowed roles. */
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
        const preset = await tx.partPreset.create({ data: { key: `reading-${stamp}`, congregationId } })
        const servicePreset = await tx.partPreset.create({
          data: { key: `sound-${stamp}`, scope: 'service', congregationId },
        })
        const template = await tx.eventTemplate.create({
          data: { name: 'Réunion de semaine', key: `midweek-${stamp}`, congregationId },
        })
        const scheduleTemplate = await tx.scheduleTemplate.create({
          data: { name: 'Réunion de semaine', kind: 'programme', congregationId },
        })
        const part = await tx.templatePart.create({
          data: {
            name: 'Lecture',
            section: 'Joyaux',
            order: 2,
            durationMin: 4,
            readerLabel: 'Lecteur',
            templateId: template.id,
            scheduleTemplateId: scheduleTemplate.id,
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
        const schedule = await tx.schedule.create({
          data: { eventId: event.id, name: 'Réunion de semaine', kind: 'programme', congregationId },
        })
        await tx.eventPart.create({
          data: {
            name: 'Lecture',
            topic: 'Matthieu 5',
            section: 'Joyaux',
            order: 2,
            eventId: event.id,
            scheduleId: schedule.id,
            partId: part.id,
            presetId: preset.id,
            assigneeId: member.id,
            assistantId: reader.id,
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
            eventId: event.id,
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
        const backfill = async () => {
          for (const statement of BACKFILL) await tx.$executeRawUnsafe(statement)
          return readNewItems(tx, congregationId)
        }
        const backfilled = await backfill()
        const rerun = await backfill()

        await tx.$executeRawUnsafe(
          `UPDATE "Item" SET "name" = 'stale', "assigneeId" = NULL WHERE "congregationId" = $1 AND "legacyServiceId" IS NOT NULL`,
          congregationId,
        )
        await tx.$executeRawUnsafe(
          `DELETE FROM "ItemAllowedRole" WHERE "congregationId" = $1 AND "slot" = 'second'`,
          congregationId,
        )
        const repaired = await backfill()

        result = {
          old,
          mirrored,
          backfilled,
          rerun,
          repaired,
          ids: { member: member.id, reader: reader.id, speakerRole: speakerRole.id, readerRole: readerRole.id },
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
  it('reads a fixture with every kind of row', async () => {
    const { old, ids } = await snapshot()

    expect(old.templateItems).toHaveLength(2)
    expect(old.items).toHaveLength(3)
    expect(old.items).toContainEqual(
      expect.objectContaining({ name: 'Lecture', assigneeId: ids.member, assistantId: ids.reader }),
    )
    expect(old.itemRoles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ roleId: ids.readerRole, slot: 'second' }),
        expect.objectContaining({ roleId: ids.speakerRole, slot: 'main' }),
      ]),
    )
    expect(old.itemRoles).toHaveLength(3)
    expect(old.templateItemRoles).toHaveLength(3)
  })

  it('mirrors every write of the old tables through the triggers', async () => {
    const { old, mirrored } = await snapshot()

    expect(mirrored).toEqual(old)
  })

  it('copies what exists, once, and repairs a stale copy on a re-run', async () => {
    const { old, backfilled, rerun, repaired } = await snapshot()

    expect(backfilled).toEqual(old)
    expect(rerun).toEqual(old)
    expect(repaired).toEqual(old)
  })

  it('keeps every data write after the marker, none cut by the split', () => {
    expect(SQL.split(MARKER)).toHaveLength(2)
    expect(BACKFILL).toHaveLength(8)
    expect(BACKFILL.every(statement => statement.startsWith('INSERT INTO'))).toBe(true)
  })
})
