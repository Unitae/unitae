import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { readNewItems, readOldItems } from '~/tests/helpers/item-mirror'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner. The catch-up only writes
// data, so its statements run inside a rolled-back transaction over a fixture the previous image could have left.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

const DATA_WRITE = /^(WITH|INSERT|UPDATE|DELETE)\b/

/** A migration's data writes, comments stripped, from `from` on. */
function dataWrites(migration: string, from = '') {
  const sql = readFileSync(join(import.meta.dirname, migration, 'migration.sql'), 'utf8')
  return sql
    .slice(from ? sql.indexOf(from) : 0)
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => DATA_WRITE.test(statement))
}

const CATCH_UP = dataWrites('20261126090000_catch_up_schedules')
const SCHEDULES = dataWrites('20261124090000_add_schedules')
const ITEMS = dataWrites('20261125090000_add_items', '\n-- backfill')

class Rollback extends Error {}

interface Result {
  /** The duty schedule template's responsible after a first run, then after its role was deleted and a second run. */
  dutyResponsible: (number | null)[]
  programmeRoleId: number
  serviceRoleId: number
  /** The schedule of a part and a duty an older image wrote without one, in the old table and in its mirror. */
  strayPartSchedule: { old: number | null; mirror: number | null }
  strayDutySchedule: { old: number | null; mirror: number | null }
  programmeScheduleId: number | null
  dutyScheduleId: number | null
  itemsInStep: boolean
}

let memo: Promise<Result> | undefined

function snapshot(): Promise<Result> {
  memo ??= (async () => {
    let result: Result | undefined
    try {
      await testDb.$transaction(async tx => {
        const run = async () => {
          for (const statement of CATCH_UP) await tx.$executeRawUnsafe(statement)
        }
        const stamp = `catch-up-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        const programmeRole = await tx.role.create({ data: { key: `p-${stamp}`, name: 'p', congregationId } })
        const serviceRole = await tx.role.create({ data: { key: `s-${stamp}`, name: 's', congregationId } })
        const template = await tx.eventTemplate.create({
          data: { name: 'Réunion de semaine', key: `midweek-${stamp}`, congregationId },
        })
        await tx.templatePart.create({ data: { name: 'Discours', order: 0, templateId: template.id, congregationId } })
        await tx.templateServicePart.create({
          data: { name: 'Sono', key: `sound-${stamp}`, templateId: template.id, congregationId },
        })
        for (const [roleId, scope] of [
          [programmeRole.id, 'programme'],
          [serviceRole.id, 'service'],
        ] as const) {
          await tx.templateResponsible.create({ data: { templateId: template.id, roleId, scope, congregationId } })
        }
        const event = await tx.event.create({
          data: {
            name: 'Réunion',
            startDate: new Date('2027-01-07T18:00:00Z'),
            endDate: new Date('2027-01-07T19:45:00Z'),
            templateId: template.id,
            congregationId,
          },
        })
        // Written by an older image: no schedule, a part and a duty.
        const stray = await tx.eventPart.create({ data: { name: 'Discours', eventId: event.id, congregationId } })
        const strayDuty = await tx.eventServicePart.create({
          data: { name: 'Sono', eventId: event.id, congregationId },
        })

        const dutyResponsible = async () =>
          (
            await tx.scheduleTemplate.findFirstOrThrow({
              where: { congregationId, kind: 'duty' },
              select: { responsibleRoleId: true },
            })
          ).responsibleRoleId

        await run()
        const first = await dutyResponsible()
        await tx.role.delete({ where: { id: serviceRole.id } })
        await run()
        const second = await dutyResponsible()

        const programme = await tx.schedule.findFirst({ where: { eventId: event.id, kind: 'programme' } })
        const duties = await tx.schedule.findFirst({ where: { eventId: event.id, kind: 'duty' } })
        const old = await tx.eventPart.findUniqueOrThrow({ where: { id: stray.id } })
        const mirror = await tx.item.findUniqueOrThrow({ where: { legacyPartId: stray.id } })
        const oldDuty = await tx.eventServicePart.findUniqueOrThrow({ where: { id: strayDuty.id } })
        const dutyMirror = await tx.item.findUniqueOrThrow({ where: { legacyServiceId: strayDuty.id } })
        result = {
          dutyResponsible: [first, second],
          programmeRoleId: programmeRole.id,
          serviceRoleId: serviceRole.id,
          strayPartSchedule: { old: old.scheduleId, mirror: mirror.scheduleId },
          strayDutySchedule: { old: oldDuty.scheduleId, mirror: dutyMirror.scheduleId },
          programmeScheduleId: programme?.id ?? null,
          dutyScheduleId: duties?.id ?? null,
          itemsInStep:
            JSON.stringify(await readOldItems(tx, congregationId)) ===
            JSON.stringify(await readNewItems(tx, congregationId)),
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

describe('catch_up_schedules migration', () => {
  it('replays add_schedules then add_items, statement for statement', () => {
    expect(SCHEDULES).toHaveLength(13)
    expect(ITEMS).toHaveLength(16)
    expect(CATCH_UP).toEqual([...SCHEDULES, ...ITEMS])
  })

  it("gives the duties back to the programme's responsible once the service responsible's role is deleted (D31)", async () => {
    const { dutyResponsible, programmeRoleId, serviceRoleId } = await snapshot()

    expect(dutyResponsible).toEqual([serviceRoleId, programmeRoleId])
  })

  it('puts a part and a duty an older image wrote without a schedule in theirs, in both shapes', async () => {
    const { strayPartSchedule, strayDutySchedule, programmeScheduleId, dutyScheduleId, itemsInStep } = await snapshot()

    expect(programmeScheduleId).not.toBeNull()
    expect(dutyScheduleId).not.toBeNull()
    expect(strayPartSchedule).toEqual({ old: programmeScheduleId, mirror: programmeScheduleId })
    expect(strayDutySchedule).toEqual({ old: dutyScheduleId, mirror: dutyScheduleId })
    expect(itemsInStep).toBe(true)
  })
})
