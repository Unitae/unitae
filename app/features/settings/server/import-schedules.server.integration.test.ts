import { PrismaPg } from '@prisma/adapter-pg'
import JsZip from 'jszip'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { EntityIdMap } from './data-transfer.type'
import { writeNdjsonFile } from './ndjson-archive'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { importEventSchedules, importKindScheduleTemplates, importScheduleTemplates, settleImportedSchedules } =
  await import('./import-schedules.server')
const { importEventParts, importEventServiceParts } = await import('./import-events.server')
const { importTemplateParts } = await import('./import-event-templates.server')
const { syncTemplateScheduleTemplates } = await import('~/features/events/index.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

interface Restored {
  db: TransactionClient
  congregationId: number
  roleId: number
  templateId: number
  releasedId: number
  emptyId: number
}

/**
 * A congregation as the earlier import steps leave it: a role, a template with a part, a service and its responsible,
 * a released event with a part and a service and an empty draft one, all written without schedules. Rolled back.
 */
async function restored(fn: (state: Restored) => Promise<void>) {
  try {
    await testDb.$transaction(async tx => {
      const stamp = `is-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
      const role = await tx.role.create({ data: { key: `${stamp}-r`, name: 'Responsable', congregationId } })
      const template = await tx.eventTemplate.create({ data: { name: 'Réunion', key: stamp, congregationId } })
      await tx.templatePart.create({ data: { name: 'Discours', order: 0, templateId: template.id, congregationId } })
      await tx.templateServicePart.create({
        data: { name: 'Sono', key: `${stamp}-s`, templateId: template.id, congregationId },
      })
      await tx.templateResponsible.create({ data: { templateId: template.id, roleId: role.id, congregationId } })
      const event = (status: string) =>
        tx.event.create({
          data: {
            name: 'Réunion',
            startDate: new Date('2027-05-04T17:00:00Z'),
            endDate: new Date('2027-05-04T19:00:00Z'),
            status,
            templateId: template.id,
            congregationId,
          },
        })
      const released = await event('released')
      const empty = await event('draft')
      await tx.eventPart.create({ data: { eventId: released.id, name: 'Discours', congregationId } })
      await tx.eventServicePart.create({ data: { eventId: released.id, name: 'Sono', congregationId } })
      await fn({
        db: tx as unknown as TransactionClient,
        congregationId,
        roleId: role.id,
        templateId: template.id,
        releasedId: released.id,
        emptyId: empty.id,
      })
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

const schedulesOf = (db: TransactionClient) =>
  db.schedule.findMany({
    select: {
      eventId: true,
      kind: true,
      name: true,
      key: true,
      status: true,
      scheduleTemplateId: true,
      _count: { select: { parts: true, serviceParts: true } },
    },
    orderBy: { order: 'asc' },
  })

describe('importing the schedules of a 2.21 archive', () => {
  it('creates its schedule templates, their links and the schedules, through the archive ids', async () => {
    await restored(async ({ db, congregationId, roleId, templateId, releasedId }) => {
      const zip = new JsZip()
      writeNdjsonFile(zip, 'schedule-templates', [
        { id: 11, name: 'Vie et ministère', key: null, kind: 'programme', responsibleRoleId: 1 },
        { id: 12, name: null, key: 'services', kind: 'duty', responsibleRoleId: null },
      ])
      writeNdjsonFile(zip, 'kind-schedule-templates', [
        { eventKindId: 2, scheduleTemplateId: 11, order: 0 },
        { eventKindId: 2, scheduleTemplateId: 12, order: 1 },
        // A link whose template did not come: left out.
        { eventKindId: 99, scheduleTemplateId: 12, order: 0 },
      ])
      writeNdjsonFile(zip, 'schedules', [
        {
          id: 21,
          eventId: 3,
          scheduleTemplateId: 11,
          name: 'Vie et ministère',
          key: null,
          kind: 'programme',
          order: 0,
          status: 'published',
        },
        {
          id: 22,
          eventId: 3,
          scheduleTemplateId: null,
          name: null,
          key: 'services',
          kind: 'duty',
          order: 1,
          status: 'published',
        },
        // A schedule whose event did not come: left out.
        {
          id: 23,
          eventId: 98,
          scheduleTemplateId: 11,
          name: null,
          key: 'programme',
          kind: 'programme',
          order: 0,
          status: 'draft',
        },
      ])
      const idMap = new EntityIdMap()
      idMap.set('roles', 1, roleId)
      idMap.set('programme-templates', 2, templateId)
      idMap.set('events', 3, releasedId)

      await importScheduleTemplates(zip, db, idMap, congregationId)
      await importKindScheduleTemplates(zip, db, idMap, congregationId)
      await importEventSchedules(zip, db, idMap, congregationId)

      const programme = idMap.getOptional('schedule-templates', 11)
      expect(
        await db.scheduleTemplate.findMany({
          select: { id: true, name: true, key: true, kind: true, responsibleRoleId: true },
          orderBy: { id: 'asc' },
        }),
      ).toEqual([
        { id: programme, name: 'Vie et ministère', key: null, kind: 'programme', responsibleRoleId: roleId },
        {
          id: idMap.getOptional('schedule-templates', 12),
          name: null,
          key: 'services',
          kind: 'duty',
          responsibleRoleId: null,
        },
      ])
      expect(await db.eventKindScheduleTemplate.count()).toBe(2)
      expect(await schedulesOf(db)).toMatchObject([
        { eventId: releasedId, kind: 'programme', status: 'published', scheduleTemplateId: programme },
        { eventId: releasedId, kind: 'duty', status: 'published', scheduleTemplateId: null, key: 'services' },
      ])
      expect(idMap.getOptional('schedules', 21)).toBeDefined()
      expect(idMap.getOptional('schedules', 23)).toBeNull()
    })
  })

  it('leaves alone what the archive covered and gives a schedule to the items that came without one', async () => {
    await restored(async ({ db, congregationId, releasedId }) => {
      // A template and an event the archive covered whole: its schedule template named otherwise than the template,
      // and the event's programme published while the event is a draft — a restore keeps both as they came (nothing of theirs came without a schedule).
      const covered = await db.eventTemplate.create({ data: { name: 'Mémorial', key: 'covered', congregationId } })
      const named = await db.scheduleTemplate.create({
        data: {
          name: 'Commémoration',
          kind: 'programme',
          congregationId,
          eventKinds: { create: { eventKindId: covered.id, order: 0, congregationId } },
        },
      })
      await db.templatePart.create({
        data: { name: 'Discours', order: 0, templateId: covered.id, scheduleTemplateId: named.id, congregationId },
      })
      const day = await db.event.create({
        data: {
          name: 'Mémorial',
          startDate: new Date('2027-04-12T17:00:00Z'),
          endDate: new Date('2027-04-12T19:00:00Z'),
          status: 'draft',
          templateId: covered.id,
          congregationId,
        },
      })
      const kept = await db.schedule.create({
        data: {
          eventId: day.id,
          scheduleTemplateId: named.id,
          kind: 'programme',
          name: 'Commémoration',
          status: 'published',
          congregationId,
        },
      })
      await db.eventPart.create({ data: { eventId: day.id, scheduleId: kept.id, name: 'Discours', congregationId } })
      const zip = new JsZip()
      writeNdjsonFile(zip, 'schedules', [])

      await settleImportedSchedules(zip, db, congregationId)

      expect(await db.scheduleTemplate.findUnique({ where: { id: named.id }, select: { name: true } })).toEqual({
        name: 'Commémoration',
      })
      expect(await db.schedule.findMany({ where: { eventId: day.id }, select: { id: true, status: true } })).toEqual([
        { id: kept.id, status: 'published' },
      ])
      // The restored event whose items came without a schedule gets them, with its status.
      expect(
        await db.schedule.findMany({
          where: { eventId: releasedId },
          select: { kind: true, status: true },
          orderBy: { order: 'asc' },
        }),
      ).toEqual([
        { kind: 'programme', status: 'published' },
        { kind: 'duty', status: 'published' },
      ])
    })
  })
})

describe('settling the schedules of an archive that carries none (2.20 and older)', () => {
  it('gives the restored templates and events the schedules the migration gives live ones', async () => {
    await restored(async ({ db, congregationId, roleId, releasedId }) => {
      await settleImportedSchedules(new JsZip(), db, congregationId)

      expect(
        await db.scheduleTemplate.findMany({
          select: { kind: true, name: true, key: true, responsibleRoleId: true },
          orderBy: { id: 'asc' },
        }),
      ).toEqual([
        { kind: 'programme', name: 'Réunion', key: null, responsibleRoleId: roleId },
        { kind: 'duty', name: null, key: 'services', responsibleRoleId: roleId },
      ])
      expect(await schedulesOf(db)).toMatchObject([
        { eventId: releasedId, kind: 'programme', status: 'published', _count: { parts: 1, serviceParts: 0 } },
        { eventId: releasedId, kind: 'duty', status: 'published', _count: { parts: 0, serviceParts: 1 } },
      ])
      expect(
        (await db.templatePart.count({ where: { scheduleTemplateId: null } })) +
          (await db.templateServicePart.count({ where: { scheduleTemplateId: null } })),
      ).toBe(0)
    })
  })

  // An archive from before the duties had their own responsible: they inherited the programme's, which the restore
  // writes once as the kind's services responsible, as the upgrade does on live data.
  it('keeps the programme responsible on the duties of a kind naming only that one, past a later save', async () => {
    await restored(async ({ db, congregationId, roleId, templateId }) => {
      await settleImportedSchedules(new JsZip(), db, congregationId)
      await syncTemplateScheduleTemplates(db, templateId, congregationId)

      expect(
        await db.templateResponsible.findMany({
          where: { templateId },
          select: { scope: true, roleId: true },
          orderBy: { scope: 'asc' },
        }),
      ).toEqual([
        { scope: 'programme', roleId },
        { scope: 'service', roleId },
      ])
      expect((await db.scheduleTemplate.findFirstOrThrow({ where: { kind: 'duty' } })).responsibleRoleId).toBe(roleId)
    })
  })
})

describe('restoring a 2.21 archive exported before the duties had their own responsible', () => {
  it('writes the role its duties schedule template holds as the kind’s services responsible', async () => {
    await restored(async ({ db, congregationId, templateId }) => {
      const dutyRole = (await db.role.create({ data: { key: `duty-${templateId}`, name: 'D', congregationId } })).id
      const zip = new JsZip()
      writeNdjsonFile(zip, 'schedules', [])
      writeNdjsonFile(zip, 'schedule-templates', [
        { id: 11, name: 'Réunion', key: null, kind: 'programme', responsibleRoleId: null },
        { id: 12, name: null, key: 'services', kind: 'duty', responsibleRoleId: 5 },
      ])
      writeNdjsonFile(zip, 'kind-schedule-templates', [
        { eventKindId: 2, scheduleTemplateId: 11, order: 0 },
        { eventKindId: 2, scheduleTemplateId: 12, order: 1 },
      ])
      const idMap = new EntityIdMap()
      idMap.set('programme-templates', 2, templateId)
      idMap.set('roles', 5, dutyRole)

      await importScheduleTemplates(zip, db, idMap, congregationId)
      await importKindScheduleTemplates(zip, db, idMap, congregationId)
      await settleImportedSchedules(zip, db, congregationId)
      // A later write of the kind re-derives its schedule templates from its responsibles.
      await syncTemplateScheduleTemplates(db, templateId, congregationId)

      expect(
        await db.templateResponsible.findFirst({ where: { templateId, scope: 'service' }, select: { roleId: true } }),
      ).toEqual({ roleId: dutyRole })
      expect((await db.scheduleTemplate.findFirstOrThrow({ where: { kind: 'duty' } })).responsibleRoleId).toBe(dutyRole)
    })
  })

  it('leaves a duties schedule template without a responsible as it is: after the upgrade that is a choice', async () => {
    await restored(async ({ db, congregationId, templateId }) => {
      await syncTemplateScheduleTemplates(db, templateId, congregationId)
      const zip = new JsZip()
      writeNdjsonFile(zip, 'schedules', [])

      await settleImportedSchedules(zip, db, congregationId)

      expect(await db.templateResponsible.count({ where: { templateId, scope: 'service' } })).toBe(0)
      expect((await db.scheduleTemplate.findFirstOrThrow({ where: { kind: 'duty' } })).responsibleRoleId).toBeNull()
    })
  })
})

describe('restoring a 2.21 archive into templates that already have schedule templates', () => {
  it("merges the archive's schedule template of a kind into the one the matched template has", async () => {
    await restored(async ({ db, congregationId, templateId }) => {
      // As a new congregation's seeded template has them before a restore matches it by its key.
      await syncTemplateScheduleTemplates(db, templateId, congregationId)
      const seeded = await db.scheduleTemplate.findMany({ select: { id: true, kind: true }, orderBy: { id: 'asc' } })
      const zip = new JsZip()
      writeNdjsonFile(zip, 'schedule-templates', [
        { id: 11, name: 'Réunion', key: null, kind: 'programme', responsibleRoleId: null },
        { id: 12, name: null, key: 'services', kind: 'duty', responsibleRoleId: null },
      ])
      writeNdjsonFile(zip, 'kind-schedule-templates', [
        { eventKindId: 2, scheduleTemplateId: 11, order: 0 },
        { eventKindId: 2, scheduleTemplateId: 12, order: 1 },
      ])
      const idMap = new EntityIdMap()
      idMap.set('programme-templates', 2, templateId)

      await importScheduleTemplates(zip, db, idMap, congregationId)
      const merged = await importKindScheduleTemplates(zip, db, idMap, congregationId)

      expect(merged).toEqual([templateId])
      expect(await db.scheduleTemplate.findMany({ select: { id: true, kind: true }, orderBy: { id: 'asc' } })).toEqual(
        seeded,
      )
      expect(await db.eventKindScheduleTemplate.count({ where: { eventKindId: templateId } })).toBe(2)
      expect(idMap.getOptional('schedule-templates', 11)).toBe(seeded.find(row => row.kind === 'programme')?.id)
      expect(idMap.getOptional('schedule-templates', 12)).toBe(seeded.find(row => row.kind === 'duty')?.id)

      // A template part the archive put in its programme schedule template lands in the one it merged into.
      writeNdjsonFile(zip, 'programme-template-parts', [
        {
          id: 51,
          name: 'Prière',
          section: '',
          track: '',
          order: 99,
          durationMin: 5,
          allowExternalSpeaker: false,
          templateId: 2,
          scheduleTemplateId: 11,
        },
      ])
      await importTemplateParts(zip, db, idMap, congregationId)
      expect(await db.templatePart.findFirst({ where: { order: 99 }, select: { scheduleTemplateId: true } })).toEqual({
        scheduleTemplateId: seeded.find(row => row.kind === 'programme')?.id,
      })
    })
  })
})

describe('restoring a schedule template the congregation renamed in Réglages', () => {
  it('keeps the archived name on the schedule template it merges into, past the settle step', async () => {
    await restored(async ({ db, congregationId, templateId }) => {
      await syncTemplateScheduleTemplates(db, templateId, congregationId)
      const zip = new JsZip()
      writeNdjsonFile(zip, 'schedule-templates', [
        { id: 11, name: 'Vie et ministère', key: null, kind: 'programme', responsibleRoleId: null },
        { id: 12, name: null, key: 'services', kind: 'duty', responsibleRoleId: null },
      ])
      writeNdjsonFile(zip, 'kind-schedule-templates', [
        { eventKindId: 2, scheduleTemplateId: 11, order: 0 },
        { eventKindId: 2, scheduleTemplateId: 12, order: 1 },
      ])
      const idMap = new EntityIdMap()
      idMap.set('programme-templates', 2, templateId)
      const before = await db.scheduleTemplate.findMany({ select: { kind: true, name: true }, orderBy: { id: 'asc' } })

      await importScheduleTemplates(zip, db, idMap, congregationId)
      await importKindScheduleTemplates(zip, db, idMap, congregationId)
      // The settle step brings the merged kinds up to date; since 6a-1b it names a schedule template on creation only.
      await syncTemplateScheduleTemplates(db, templateId, congregationId)

      const names = await db.scheduleTemplate.findMany({ select: { kind: true, name: true }, orderBy: { id: 'asc' } })
      expect(names.find(row => row.kind === 'programme')?.name).toBe('Vie et ministère')
      // An unnamed one in the archive leaves the congregation's own name as it was.
      expect(names.find(row => row.kind === 'duty')?.name).toBe(before.find(row => row.kind === 'duty')?.name)
    })
  })
})

describe('restoring a 2.21 archive that a real export could not have written', () => {
  it('skips what would break a rule and lets the settle step place the items instead', async () => {
    await restored(async ({ db, congregationId, releasedId, emptyId }) => {
      const zip = new JsZip()
      writeNdjsonFile(zip, 'schedule-templates', [
        { id: 11, name: null, key: null, kind: 'duty', responsibleRoleId: null },
        { id: 13, name: 'Hebdomadaire', key: null, kind: 'weekly', responsibleRoleId: null },
      ])
      writeNdjsonFile(zip, 'schedules', [
        {
          id: 21,
          eventId: 3,
          scheduleTemplateId: 77,
          name: 'Réunion',
          key: null,
          kind: 'programme',
          order: 0,
          status: 'published',
        },
        // A second programme for the same event (D9 refuses it), a kind and a status this version does not know.
        {
          id: 22,
          eventId: 3,
          scheduleTemplateId: null,
          name: null,
          key: 'programme',
          kind: 'programme',
          order: 0,
          status: 'published',
        },
        {
          id: 23,
          eventId: 3,
          scheduleTemplateId: null,
          name: null,
          key: null,
          kind: 'weekly',
          order: 2,
          status: 'published',
        },
        {
          id: 24,
          eventId: 4,
          scheduleTemplateId: 11,
          name: null,
          key: null,
          kind: 'duty',
          order: 1,
          status: 'archived',
        },
      ])
      const part = (id: number, eventId: number, scheduleId: number) => ({
        id,
        topic: '',
        note: '',
        hasConflict: false,
        name: 'Discours',
        section: '',
        track: '',
        order: id,
        durationMin: null,
        eventId,
        partId: null,
        assigneeId: null,
        assistantId: null,
        scheduleId,
      })
      writeNdjsonFile(zip, 'programme-part-assignments', [
        part(31, 3, 21),
        // Named schedules of another event and of the other kind: the item keeps its event, not that schedule.
        part(32, 3, 24),
      ])
      writeNdjsonFile(zip, 'programme-service-role-assignments', [
        {
          id: 41,
          note: '',
          hasConflict: false,
          name: 'Sono',
          eventId: 4,
          servicePartId: null,
          assigneeId: null,
          order: 0,
          scheduleId: 24,
        },
        {
          id: 42,
          note: '',
          hasConflict: false,
          name: 'Accueil',
          eventId: 3,
          servicePartId: null,
          assigneeId: null,
          order: 5,
          scheduleId: 21,
        },
      ])
      const idMap = new EntityIdMap()
      idMap.set('events', 3, releasedId)
      idMap.set('events', 4, emptyId)
      await db.eventPart.deleteMany()
      await db.eventServicePart.deleteMany()

      await importScheduleTemplates(zip, db, idMap, congregationId)
      await importEventSchedules(zip, db, idMap, congregationId)
      await importEventParts(zip, db, idMap, congregationId)
      await importEventServiceParts(zip, db, idMap, congregationId)

      expect(idMap.getOptional('schedule-templates', 13)).toBeNull()
      expect(await db.scheduleTemplate.findMany({ select: { key: true, kind: true } })).toEqual([
        { key: 'services', kind: 'duty' },
      ])
      const programme = idMap.getOptional('schedules', 21)
      const duties = idMap.getOptional('schedules', 24)
      expect([idMap.getOptional('schedules', 22), idMap.getOptional('schedules', 23)]).toEqual([null, null])
      expect(
        await db.schedule.findMany({ select: { id: true, key: true, status: true }, orderBy: { id: 'asc' } }),
      ).toEqual([
        { id: programme, key: null, status: 'published' },
        { id: duties, key: 'services', status: 'draft' },
      ])
      expect(
        await db.eventPart.findMany({
          select: { name: true, order: true, scheduleId: true },
          orderBy: { order: 'asc' },
        }),
      ).toEqual([
        { name: 'Discours', order: 31, scheduleId: programme },
        { name: 'Discours', order: 32, scheduleId: null },
      ])
      expect(
        await db.eventServicePart.findMany({ select: { name: true, scheduleId: true }, orderBy: { order: 'asc' } }),
      ).toEqual([
        { name: 'Sono', scheduleId: duties },
        { name: 'Accueil', scheduleId: null },
      ])
    })
  })

  it('leaves the archived statuses of an event alone when one of its items came without a schedule', async () => {
    await restored(async ({ db, congregationId, emptyId }) => {
      const archived = await db.schedule.create({
        data: { eventId: emptyId, kind: 'programme', key: 'programme', status: 'published', congregationId },
      })
      await db.eventPart.create({
        data: { eventId: emptyId, scheduleId: archived.id, name: 'Discours', congregationId },
      })
      await db.eventPart.create({ data: { eventId: emptyId, name: 'Lecture', congregationId } })
      const zip = new JsZip()
      writeNdjsonFile(zip, 'schedules', [])

      await settleImportedSchedules(zip, db, congregationId)

      expect(await db.schedule.findMany({ where: { eventId: emptyId }, select: { id: true, status: true } })).toEqual([
        { id: archived.id, status: 'published' },
      ])
      expect(await db.eventPart.count({ where: { eventId: emptyId, scheduleId: archived.id } })).toBe(2)
    })
  })
})
