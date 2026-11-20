import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner. The backfill's statements are
// read from the shipped file and run inside a rolled-back transaction; its DDL is already applied (CI migrates first),
// and running it again here would only take locks.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

const ALL_STATEMENTS = readFileSync(join(import.meta.dirname, '20261124090000_add_schedules', 'migration.sql'), 'utf8')
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement.length > 0)
// The backfill's statements: the data writes, after the DDL.
const DATA_WRITE = /^(WITH|INSERT|UPDATE|DELETE)\b/
const BACKFILL = ALL_STATEMENTS.filter(statement => DATA_WRITE.test(statement))

class Rollback extends Error {}

interface ScheduleTemplateRow {
  kind: string
  name: string | null
  key: string | null
  responsibleRoleId: number | null
  order: number
}

interface ScheduleRow {
  id: number
  kind: string
  name: string | null
  key: string | null
  status: string
  /** The template whose schedule template it was made from, and that schedule template's kind; null without one. */
  madeFrom: { templateId: number; kind: string } | null
  parts: number[]
  services: number[]
}

interface State {
  /** By template id: its schedule templates, in order. */
  scheduleTemplates: Record<number, ScheduleTemplateRow[]>
  /** Template items whose schedule template is not their own template's of their kind. */
  strayTemplateItems: number
  /** By event id: its schedules, by kind. */
  schedules: Record<number, ScheduleRow[]>
  /** Items of the fixture's events left without a schedule. */
  itemsWithoutSchedule: number
  scheduleCount: number
  scheduleTemplateCount: number
}

interface Result {
  ids: Record<string, number>
  first: State
  second: State
  secondProgrammeRefused: boolean
  otherCongregationScheduleTemplates: number
}

let memo: Promise<Result> | undefined

/**
 * Templates and events as the previous image leaves them when the migration runs, with one schedule template and one
 * schedule the new image made first; then what the previous image writes before the next release's run.
 */
function snapshot(): Promise<Result> {
  memo ??= (async () => {
    let result: Result | undefined
    try {
      await testDb.$transaction(async tx => {
        const stamp = `schedules-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        const role = (key: string) => tx.role.create({ data: { key: `${key}-${stamp}`, name: key, congregationId } })
        const programmeRole = await role('programme')
        const serviceRole = await role('service')
        const template = (name: string, key = `${name}-${stamp}`) =>
          tx.eventTemplate.create({ data: { name, key, congregationId } })
        const part = (templateId: number, order: number) =>
          tx.templatePart.create({ data: { name: `Partie ${order}`, order, templateId, congregationId } })
        const service = (templateId: number, order: number) =>
          tx.templateServicePart.create({
            data: { name: `Service ${order}`, key: `s${order}-${stamp}`, order, templateId, congregationId },
          })
        const responsible = (templateId: number, roleId: number, scope: string) =>
          tx.templateResponsible.create({ data: { templateId, roleId, scope, congregationId } })

        // Both kinds, a responsible for each scope.
        const midweek = await template('Réunion de semaine')
        await part(midweek.id, 0)
        await part(midweek.id, 5)
        await service(midweek.id, 0)
        await service(midweek.id, 5)
        await responsible(midweek.id, programmeRole.id, 'programme')
        await responsible(midweek.id, serviceRole.id, 'service')
        // Parts only, the programme responsible only — and a programme schedule template the new image already made.
        const weekend = await template('Réunion de week-end')
        await part(weekend.id, 0)
        await responsible(weekend.id, programmeRole.id, 'programme')
        const madeFirst = await tx.scheduleTemplate.create({
          data: { name: 'Réunion de week-end', kind: 'programme', congregationId },
        })
        await tx.eventKindScheduleTemplate.create({
          data: { eventKindId: weekend.id, scheduleTemplateId: madeFirst.id, order: 0, congregationId },
        })
        // Services only, no service responsible: the duties fall to the programme one (D31).
        const servicesOnly = await template('Nettoyage')
        await service(servicesOnly.id, 0)
        await responsible(servicesOnly.id, programmeRole.id, 'programme')
        // Neither parts nor services: nothing to make.
        const bare = await template('Visite')
        // The freeform template never gets schedule templates, even with items.
        const freeform = await template('Autre évènement', 'freeform')
        await part(freeform.id, 0)
        // A template the previous image deletes between the two runs.
        const temporary = await template('Temporaire')
        await part(temporary.id, 0)

        const event = (templateId: number, day: string, status: string) =>
          tx.event.create({
            data: {
              name: 'Réunion',
              startDate: new Date(`${day}T17:00:00Z`),
              endDate: new Date(`${day}T19:00:00Z`),
              status,
              templateId,
              congregationId,
            },
          })
        const eventPart = (eventId: number, scheduleId?: number) =>
          tx.eventPart.create({ data: { eventId, name: 'Partie', congregationId, scheduleId } })
        const eventService = (eventId: number) =>
          tx.eventServicePart.create({ data: { eventId, name: 'Sono', congregationId } })

        const released = await event(midweek.id, '2027-01-05', 'released')
        await eventPart(released.id)
        await eventPart(released.id)
        await eventService(released.id)
        const draft = await event(midweek.id, '2027-01-12', 'draft')
        await eventPart(draft.id)
        await eventService(draft.id)
        const weekendEvent = await event(weekend.id, '2027-01-10', 'released')
        await eventPart(weekendEvent.id)
        const cleaning = await event(servicesOnly.id, '2027-01-09', 'draft')
        await eventService(cleaning.id)
        const empty = await event(midweek.id, '2027-01-19', 'draft')
        const visit = await event(bare.id, '2027-01-20', 'draft')
        // An event whose template has no schedule template to make its schedules from: its items still get them.
        const other = await event(freeform.id, '2027-01-21', 'released')
        await eventPart(other.id)
        await eventService(other.id)
        // The new image already gave this one its programme schedule, and one of its parts.
        const prepared = await event(midweek.id, '2027-01-26', 'draft')
        const existing = await tx.schedule.create({
          data: { eventId: prepared.id, kind: 'programme', name: 'Réunion de semaine', congregationId },
        })
        await eventPart(prepared.id, existing.id)
        await eventPart(prepared.id)

        // Another congregation's template, which this one's run must not see differently: it gets its own.
        const otherCongregationId = (
          await tx.congregation.create({ data: { name: `${stamp}-b`, slug: `${stamp}-b`, active: true } })
        ).id
        const foreign = await tx.eventTemplate.create({
          data: { name: 'Réunion', key: `foreign-${stamp}`, congregationId: otherCongregationId },
        })
        await tx.templatePart.create({
          data: { name: 'Partie', order: 0, templateId: foreign.id, congregationId: otherCongregationId },
        })

        const ids = {
          midweek: midweek.id,
          weekend: weekend.id,
          servicesOnly: servicesOnly.id,
          bare: bare.id,
          freeform: freeform.id,
          madeFirst: madeFirst.id,
          programmeRole: programmeRole.id,
          serviceRole: serviceRole.id,
          released: released.id,
          draft: draft.id,
          weekendEvent: weekendEvent.id,
          cleaning: cleaning.id,
          empty: empty.id,
          visit: visit.id,
          other: other.id,
          prepared: prepared.id,
          existing: existing.id,
        }

        const read = async (): Promise<State> => {
          const links = await tx.eventKindScheduleTemplate.findMany({
            where: { congregationId },
            include: { scheduleTemplate: true },
            orderBy: [{ eventKindId: 'asc' }, { order: 'asc' }],
          })
          const scheduleTemplates: State['scheduleTemplates'] = {}
          const madeFrom = new Map<number, { templateId: number; kind: string }>()
          for (const link of links) {
            const { kind, name, key, responsibleRoleId } = link.scheduleTemplate
            scheduleTemplates[link.eventKindId] ??= []
            scheduleTemplates[link.eventKindId].push({ kind, name, key, responsibleRoleId, order: link.order })
            madeFrom.set(link.scheduleTemplateId, { templateId: link.eventKindId, kind })
          }
          const ownOf = (templateId: number, kind: string) =>
            links.find(link => link.eventKindId === templateId && link.scheduleTemplate.kind === kind)
              ?.scheduleTemplateId ?? null
          const templateParts = await tx.templatePart.findMany({ where: { congregationId } })
          const templateServices = await tx.templateServicePart.findMany({ where: { congregationId } })
          const strayTemplateItems =
            templateParts.filter(item => item.scheduleTemplateId !== ownOf(item.templateId, 'programme')).length +
            templateServices.filter(item => item.scheduleTemplateId !== ownOf(item.templateId, 'duty')).length

          const rows = await tx.schedule.findMany({
            where: { congregationId },
            include: { parts: { select: { id: true } }, serviceParts: { select: { id: true } } },
            orderBy: [{ eventId: 'asc' }, { order: 'asc' }],
          })
          const schedules: State['schedules'] = {}
          for (const row of rows) {
            schedules[row.eventId] ??= []
            schedules[row.eventId].push({
              id: row.id,
              kind: row.kind,
              name: row.name,
              key: row.key,
              status: row.status,
              madeFrom: row.scheduleTemplateId == null ? null : (madeFrom.get(row.scheduleTemplateId) ?? null),
              parts: row.parts.map(item => item.id).sort((a, b) => a - b),
              services: row.serviceParts.map(item => item.id).sort((a, b) => a - b),
            })
          }
          const itemsWithoutSchedule =
            (await tx.eventPart.count({ where: { congregationId, scheduleId: null } })) +
            (await tx.eventServicePart.count({ where: { congregationId, scheduleId: null } }))
          return {
            scheduleTemplates,
            strayTemplateItems,
            schedules,
            itemsWithoutSchedule,
            scheduleCount: rows.length,
            scheduleTemplateCount: await tx.scheduleTemplate.count({ where: { congregationId } }),
          }
        }

        // Made from the weekend template at the first run; the previous image gives it the midweek one before the second.
        const switched = await event(weekend.id, '2027-01-17', 'draft')
        await eventPart(switched.id)

        for (const statement of BACKFILL) await tx.$executeRawUnsafe(statement)
        const first = await read()

        // What the previous image writes before the next release's run: a part on an event that has its programme, a
        // new released event of a template that has its schedule templates, a changed service responsible, and an
        // event taken back to a draft without touching its schedules.
        await eventPart(weekendEvent.id)
        const late = await event(midweek.id, '2027-02-02', 'released')
        await eventPart(late.id)
        await eventService(late.id)
        await tx.templateResponsible.updateMany({
          where: { templateId: midweek.id, scope: 'service' },
          data: { roleId: programmeRole.id },
        })
        await tx.event.update({ where: { id: released.id }, data: { status: 'draft' } })
        await tx.event.update({ where: { id: switched.id }, data: { templateId: midweek.id } })
        await tx.eventTemplate.update({ where: { id: weekend.id }, data: { name: 'Réunion publique' } })
        await tx.eventTemplate.delete({ where: { id: temporary.id } })
        Object.assign(ids, { late: late.id, switched: switched.id })

        for (const statement of BACKFILL) await tx.$executeRawUnsafe(statement)
        const second = await read()

        let secondProgrammeRefused = false
        try {
          await tx.$executeRawUnsafe('SAVEPOINT second_programme')
          await tx.schedule.create({ data: { eventId: released.id, kind: 'programme', congregationId } })
        } catch {
          secondProgrammeRefused = true
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT second_programme')
        }

        result = {
          ids,
          first,
          second,
          secondProgrammeRefused,
          otherCongregationScheduleTemplates: await tx.eventKindScheduleTemplate.count({
            where: { eventKindId: foreign.id, congregationId: otherCongregationId },
          }),
        }
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (!result) throw new Error('the fixture did not run')
    return result
  })()
  return memo
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('20261124090000_add_schedules', () => {
  it('gives each template a schedule template per kind of item it has, programme first, never a freeform one', async () => {
    const { ids, first } = await snapshot()

    expect(first.scheduleTemplates[ids.midweek]).toEqual([
      { kind: 'programme', name: 'Réunion de semaine', key: null, responsibleRoleId: ids.programmeRole, order: 0 },
      { kind: 'duty', name: null, key: 'services', responsibleRoleId: ids.serviceRole, order: 1 },
    ])
    expect(first.scheduleTemplates[ids.servicesOnly]).toEqual([
      // No service responsible: the programme one answers for the duties (D31).
      { kind: 'duty', name: null, key: 'services', responsibleRoleId: ids.programmeRole, order: 1 },
    ])
    expect(first.scheduleTemplates[ids.bare]).toBeUndefined()
    expect(first.scheduleTemplates[ids.freeform]).toBeUndefined()
    expect(first.strayTemplateItems).toBe(0)
  })

  it('reuses a schedule template the new image made first, and gives it its responsible', async () => {
    const { ids, first } = await snapshot()

    expect(first.scheduleTemplates[ids.weekend]).toEqual([
      { kind: 'programme', name: 'Réunion de week-end', key: null, responsibleRoleId: ids.programmeRole, order: 0 },
    ])
  })

  it('gives each event a schedule per kind of item it has, with its status, its items inside', async () => {
    const { ids, first } = await snapshot()
    const programme = { kind: 'programme', name: 'Réunion de semaine', key: null }
    const duties = { kind: 'duty', name: null, key: 'services' }

    expect(first.schedules[ids.released]).toMatchObject([
      { ...programme, status: 'published', madeFrom: { templateId: ids.midweek, kind: 'programme' } },
      { ...duties, status: 'published', madeFrom: { templateId: ids.midweek, kind: 'duty' } },
    ])
    expect(first.schedules[ids.released][0].parts).toHaveLength(2)
    expect(first.schedules[ids.released][1].services).toHaveLength(1)
    expect(first.schedules[ids.draft]).toMatchObject([
      { ...programme, status: 'draft' },
      { ...duties, status: 'draft' },
    ])
    expect(first.schedules[ids.weekendEvent]).toMatchObject([{ kind: 'programme', status: 'published' }])
    expect(first.schedules[ids.cleaning]).toMatchObject([{ ...duties, madeFrom: { templateId: ids.servicesOnly } }])
    expect(first.schedules[ids.empty]).toBeUndefined()
    expect(first.schedules[ids.visit]).toBeUndefined()
    expect(first.itemsWithoutSchedule).toBe(0)
  })

  it('gives the items of an event whose template has no schedule template a schedule all the same', async () => {
    const { ids, first } = await snapshot()

    expect(first.schedules[ids.other]).toMatchObject([
      {
        kind: 'programme',
        name: null,
        key: 'programme',
        status: 'published',
        madeFrom: null,
        parts: [expect.any(Number)],
      },
      {
        kind: 'duty',
        name: null,
        key: 'services',
        status: 'published',
        madeFrom: null,
        services: [expect.any(Number)],
      },
    ])
  })

  it('puts the parts of an event the new image already gave a programme into that one', async () => {
    const { ids, first } = await snapshot()

    expect(first.schedules[ids.prepared]).toHaveLength(1)
    expect(first.schedules[ids.prepared][0]).toMatchObject({ id: ids.existing, kind: 'programme' })
    expect(first.schedules[ids.prepared][0].parts).toHaveLength(2)
  })

  it('creates nothing twice on a re-run and takes in what the previous image wrote meanwhile', async () => {
    const { ids, first, second } = await snapshot()

    // The deleted template's one, nothing else.
    expect(second.scheduleTemplateCount).toBe(first.scheduleTemplateCount - 1)
    // The new event's two schedules, nothing else.
    expect(second.scheduleCount).toBe(first.scheduleCount + 2)
    expect(second.itemsWithoutSchedule).toBe(0)
    expect(second.schedules[ids.weekendEvent][0].parts).toHaveLength(2)
    expect(second.schedules[ids.late]).toMatchObject([
      { kind: 'programme', status: 'published' },
      { kind: 'duty', status: 'published' },
    ])
    // The changed service responsible reaches the duties.
    expect(second.scheduleTemplates[ids.midweek][1].responsibleRoleId).toBe(ids.programmeRole)
  })

  it('follows a rename, a template applied to an event and a deleted template on a re-run', async () => {
    const { ids, first, second } = await snapshot()

    expect(first.schedules[ids.switched]).toMatchObject([
      { kind: 'programme', name: 'Réunion de week-end', madeFrom: { templateId: ids.weekend } },
    ])
    expect(second.schedules[ids.switched]).toMatchObject([
      { kind: 'programme', name: 'Réunion de semaine', madeFrom: { templateId: ids.midweek, kind: 'programme' } },
    ])
    expect(second.scheduleTemplates[ids.weekend]).toMatchObject([{ kind: 'programme', name: 'Réunion publique' }])
  })

  it("lets the event's status win where the previous image changed it", async () => {
    const { ids, second } = await snapshot()

    expect(second.schedules[ids.released].map(schedule => schedule.status)).toEqual(['draft', 'draft'])
  })

  it('refuses a second programme on an event (D9)', async () => {
    expect((await snapshot()).secondProgrammeRefused).toBe(true)
  })

  it("leaves another congregation's templates to their own schedule templates", async () => {
    expect((await snapshot()).otherCongregationScheduleTemplates).toBe(1)
  })

  it('creates the tables before the backfill reads them, with the D9 index', () => {
    const firstBackfill = ALL_STATEMENTS.indexOf(BACKFILL[0])
    const index = ALL_STATEMENTS.findIndex(statement => statement.includes('"Schedule_programme_eventId_key"'))

    // Every data write of the file, none skipped by the split: a new step changes this count on purpose.
    expect(BACKFILL).toHaveLength(13)
    expect(index).toBeGreaterThan(-1)
    expect(index).toBeLessThan(firstBackfill)
  })
})
