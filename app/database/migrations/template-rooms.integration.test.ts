import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// 20261130090000_template_rooms: a template's copies become one part held in their rooms, template parts stop carrying
// a room in `track`, and the template part trigger only fills in a part's room when it has none. CI applies the
// migration before the suite: the merge is exercised by writing copies the way older code did (or an older archive
// restores them) and calling the shipped `merge_template_part_copies` again; the trigger by writing rows.

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 }),
})

afterAll(async () => {
  await db.$disconnect()
})

const shipped = readFileSync(join(__dirname, '20261130090000_template_rooms', 'migration.sql'), 'utf8')
/** Top-level statements of a migration file, a `$$` function body kept whole. */
function statementsOf(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let inBody = false
  for (const line of sql.split('\n')) {
    if (!inBody && line.trimStart().startsWith('--')) continue
    current += `${line}\n`
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inBody = !inBody
    if (!inBody && line.trimEnd().endsWith(';')) {
      statements.push(current.trim())
      current = ''
    }
  }
  return statements.filter(statement => statement !== '')
}

/** #648's own trigger function and prune, as a database still runs them when this migration starts. */
const previous = statementsOf(
  readFileSync(join(__dirname, '20261129090000_parallel_rooms', 'migration.sql'), 'utf8'),
).filter(
  statement =>
    statement.startsWith('CREATE OR REPLACE FUNCTION "template_part_room"()') ||
    statement.startsWith('CREATE OR REPLACE FUNCTION "prune_schedule_template_rooms"('),
)

/** The merge, for one congregation as a restore runs it, or for all as the migration did. */
const merge = (tx: PrismaClient, congregationId: number | null) =>
  tx.$queryRawUnsafe<{ merged: number }[]>('SELECT "merge_template_part_copies"($1) AS merged', congregationId)

class Rollback extends Error {}

interface Fixture {
  tx: PrismaClient
  congregationId: number
  scheduleTemplateId: number
  kindId: number
  partIds: Record<string, number>
  itemId: number
}

/**
 * Copies as older code wrote them: « Lecture » in « Salle principale » and in « Deuxième école » (same section and
 * order), « Visite » alone in « Annexe », « Discours » for everyone; a meeting part made from the second copy.
 */
async function inFixture<T>(fn: (f: Fixture) => Promise<T>): Promise<T> {
  let result: T | undefined
  try {
    await db.$transaction(async t => {
      const tx = t as unknown as PrismaClient
      const stamp = `trooms-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      const scheduleTemplateId = (
        await tx.scheduleTemplate.create({ data: { name: stamp, kind: 'programme', congregationId } })
      ).id
      const kindId = (await tx.eventTemplate.create({ data: { name: stamp, key: `${stamp}-k`, congregationId } })).id
      const part = async (name: string, track: string, order: number) =>
        (
          await tx.templatePart.create({
            data: { name, section: 'Joyaux', track, order, templateId: kindId, scheduleTemplateId, congregationId },
          })
        ).id
      const partIds = {
        discours: await part('Discours', '', 1),
        lectureMain: await part('Lecture', 'Salle principale', 2),
        lectureSecond: await part('Lecture', 'Deuxième école', 2),
        visite: await part('Visite', 'Annexe', 3),
      }
      const eventId = (
        await tx.event.create({ data: { name: stamp, startDate: new Date(), endDate: new Date(), congregationId } })
      ).id
      const secondTemplateItem = await tx.templateItem.findFirstOrThrow({
        where: { legacyPartId: partIds.lectureSecond },
      })
      const itemId = (
        await tx.item.create({
          data: { name: 'Lecture', eventId, templateItemId: secondTemplateItem.id, congregationId },
        })
      ).id
      result = await fn({ tx, congregationId, scheduleTemplateId, kindId, partIds, itemId })
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  return result as T
}

/** Each part left in the template, its track and its rooms by name (the main room shows its key). */
async function partsOf(f: Fixture) {
  const parts = await f.tx.templatePart.findMany({
    where: { scheduleTemplateId: f.scheduleTemplateId },
    include: { rooms: { include: { room: true } } },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  })
  return parts.map(part => ({
    id: part.id,
    name: part.name,
    track: part.track,
    rooms: part.rooms.map(row => (row.room.key === 'main' ? 'main' : (row.room.name ?? '?'))).sort(),
  }))
}

describe('20261130090000_template_rooms, applied as it ships over #648', () => {
  // The whole file, in its order, on a database still running #648's trigger: what `migrate deploy` does. Two shapes
  // that once failed it: copies of a part (production's), and a part alone in another room (the #642 editor's).
  it('merges the copies and holds a part alone in another room in the main room too', async () => {
    expect(previous).toHaveLength(2)
    const parts = await inFixture(async f => {
      for (const statement of previous) await f.tx.$executeRawUnsafe(statement)
      // Written under #648's trigger, as the editor wrote them: a hall with its room order.
      await f.tx.templatePart.create({
        data: {
          name: 'Seule',
          section: 'Joyaux',
          track: 'Salle B',
          trackOrder: 2,
          order: 4,
          templateId: f.kindId,
          scheduleTemplateId: f.scheduleTemplateId,
          congregationId: f.congregationId,
        },
      })
      for (const statement of statementsOf(shipped)) await f.tx.$executeRawUnsafe(statement)
      return (await partsOf(f)).map(({ name, track, rooms }) => ({ name, track, rooms }))
    })
    expect(parts).toEqual([
      { name: 'Discours', track: '', rooms: ['main'] },
      { name: 'Lecture', track: '', rooms: ['Deuxième école', 'main'] },
      { name: 'Visite', track: '', rooms: ['Annexe', 'main'] },
      { name: 'Seule', track: '', rooms: ['Salle B', 'main'] },
    ])
  })
})

describe('20261130090000_template_rooms', () => {
  it('runs the merge for every congregation, as it ships', () => {
    expect(shipped).toContain('SELECT "merge_template_part_copies"(NULL);')
  })

  it('merges one congregation’s copies only, and says how many went', async () => {
    const { mine, theirs } = await inFixture(async f => {
      const other = await f.tx.congregation.create({
        data: { name: `${f.congregationId}-o`, slug: `${f.congregationId}-o`, active: true },
      })
      const template = await f.tx.scheduleTemplate.create({
        data: { name: 'o', kind: 'programme', congregationId: other.id },
      })
      const kind = await f.tx.eventTemplate.create({
        data: { name: 'o', key: `o-${other.id}`, congregationId: other.id },
      })
      for (const track of ['Salle principale', 'Deuxième école']) {
        await f.tx.templatePart.create({
          data: {
            name: 'Lecture',
            section: 'Joyaux',
            track,
            order: 2,
            templateId: kind.id,
            scheduleTemplateId: template.id,
            congregationId: other.id,
          },
        })
      }
      const [mine] = await merge(f.tx, f.congregationId)
      return { mine: mine?.merged, theirs: await f.tx.templatePart.count({ where: { congregationId: other.id } }) }
    })
    expect(mine).toBe(1)
    expect(theirs).toBe(2)
  })

  it('makes a template’s copies one part held in their rooms, the main room’s copy kept', async () => {
    const { parts, ids } = await inFixture(async f => {
      await merge(f.tx, f.congregationId)
      return { parts: await partsOf(f), ids: f.partIds }
    })
    expect(parts).toEqual([
      { id: ids.discours, name: 'Discours', track: '', rooms: ['main'] },
      { id: ids.lectureMain, name: 'Lecture', track: '', rooms: ['Deuxième école', 'main'] },
      // Alone in another room: held in the main room too, as every part in parallel is.
      { id: ids.visite, name: 'Visite', track: '', rooms: ['Annexe', 'main'] },
    ])
  })

  it('points a meeting part made from a removed copy at the kept part, and running it twice changes nothing', async () => {
    const { linkedTo, kept, first, second } = await inFixture(async f => {
      await merge(f.tx, f.congregationId)
      const first = await partsOf(f)
      await merge(f.tx, f.congregationId)
      const item = await f.tx.item.findUniqueOrThrow({ where: { id: f.itemId } })
      const kept = await f.tx.templateItem.findFirstOrThrow({ where: { legacyPartId: f.partIds.lectureMain } })
      return { linkedTo: item.templateItemId, kept: kept.id, first, second: await partsOf(f) }
    })
    expect(linkedTo).toBe(kept)
    expect(second).toEqual(first)
  })

  it('fills in a new part’s room and leaves the rooms a part already has, whatever its track says', async () => {
    const { added, kept } = await inFixture(async f => {
      await merge(f.tx, f.congregationId)
      const added = await f.tx.templatePart.create({
        data: {
          name: 'Nouvelle',
          section: 'Joyaux',
          order: 9,
          templateId: f.kindId,
          scheduleTemplateId: f.scheduleTemplateId,
          congregationId: f.congregationId,
        },
      })
      // An older writer setting a track on a part held in two rooms: its rooms stay.
      await f.tx.templatePart.update({ where: { id: f.partIds.lectureMain }, data: { track: 'Autre' } })
      const parts = await partsOf(f)
      return {
        added: parts.find(part => part.id === added.id)?.rooms,
        kept: parts.find(part => part.id === f.partIds.lectureMain)?.rooms,
      }
    })
    expect(added).toEqual(['main'])
    expect(kept).toEqual(['Deuxième école', 'main'])
  })
})
