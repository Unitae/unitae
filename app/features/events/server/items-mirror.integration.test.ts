import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { type ItemTables, readNewItems, readOldItems } from '~/tests/helpers/item-mirror'
import { settleFixtureSchedules } from '~/tests/helpers/settle-fixture-schedules'

// Parts and duties are one item (plan T12). The writers write the item tables alone; triggers still copy every write of
// the eight old item tables into TemplateItem, Item and their allowed roles, and that copy is what these check. The
// app's writers leave no old row behind, so a comparison keeps the rows with a legacy key: the ones the triggers made.
// These run the app's writers and direct Prisma writes under the tenant scope, as the app's database role where
// DB_RUNTIME_URL names it (CI does).

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { seedDefaultTemplates } = await import('./seed-templates.server')
const { createProgrammeOnDay } = await import('./programme-creation.server')
const { addPartAssignment, addServicePartAssignment } = await import('./event-parts.server')
const { applyTemplateToEvent } = await import('./apply-template.server')
const { bulkDeleteEvents } = await import('./delete-events.server')
const { duplicateTemplate } = await import('./duplicate-template.server')
const { deleteTemplate } = await import('./delete-template.server')
const { setPartAssignmentAllowedRoles, setServicePartAssignmentAllowedRoles, setTemplatePartAllowedRoles } =
  await import('./allowed-roles.server')

const UNKNOWN_KIND = /unknown allowed-role kind 'host'/

class Rollback extends Error {}

interface Fixture {
  db: TransactionClient
  congregationId: number
  actorId: number
  /** Fails the test unless the rows the triggers mirror hold exactly what the old tables do. */
  inStep: () => Promise<void>
  templateId: (key: string) => Promise<number>
  /** The role the fixture allows in every slot. */
  roleId: number
}

/** The rows a trigger made: every new row with a legacy key. The writers' own rows have none. */
function mirroredRowsOnly(tables: ItemTables): ItemTables {
  const legacy = (rows: Record<string, unknown>[]) => rows.filter(row => row.k !== null)
  return {
    templateItems: legacy(tables.templateItems),
    templateItemRoles: legacy(tables.templateItemRoles),
    items: legacy(tables.items),
    itemRoles: legacy(tables.itemRoles),
  }
}

/** Runs `fn` in a congregation of its own with the default templates, inside a transaction that is rolled back. */
async function inCongregation(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `mirror-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const actorId = (
          await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
        ).id
        const db = tx as unknown as TransactionClient
        await seedDefaultTemplates(db, congregationId, 'fr')
        // The seed writes no allowed roles: one role in both slots of every part and on every duty, so the four
        // allowed-role tables have rows to mirror.
        const role = await tx.role.create({ data: { key: `brother-${stamp}`, name: 'brother', congregationId } })
        for (const { id: partId } of await tx.templatePart.findMany({
          where: { congregationId },
          select: { id: true },
        })) {
          await tx.templatePartAllowedRole.createMany({
            data: ['speaker', 'reader'].map(asKind => ({ partId, roleId: role.id, asKind, congregationId })),
          })
        }
        for (const { id: servicePartId } of await tx.templateServicePart.findMany({
          where: { congregationId },
          select: { id: true },
        })) {
          await tx.templateServicePartAllowedRole.create({ data: { servicePartId, roleId: role.id, congregationId } })
        }
        await fn({
          db,
          congregationId,
          actorId,
          inStep: async () => {
            const [old, mirrored] = [await readOldItems(tx, congregationId), await readNewItems(tx, congregationId)]
            expect(mirroredRowsOnly(mirrored)).toEqual(old)
          },
          templateId: async key => (await tx.eventTemplate.findFirstOrThrow({ where: { key } })).id,
          roleId: role.id,
        })
        throw new Rollback()
      },
      { timeout: 20_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

/**
 * A programme with one part and one service written to the old tables, the rows the triggers mirror (the app's writers
 * no longer write them). Each is allowed in both slots of the fixture's role; settled, they sit in their schedules.
 */
async function oldRowProgramme(
  db: TransactionClient,
  options: {
    congregationId: number
    actorId: number
    roleId: number
    templateId: number
    partId: number
    servicePartId: number
    day: string
  },
) {
  const { congregationId, actorId, roleId, templateId, partId, servicePartId, day } = options
  const event = await db.event.create({
    data: {
      name: 'Réunion',
      startDate: new Date(`${day}T17:00:00Z`),
      endDate: new Date(`${day}T19:00:00Z`),
      status: 'draft',
      templateId,
      createdById: actorId,
      congregationId,
    },
  })
  const part = await db.eventPart.create({
    data: {
      eventId: event.id,
      partId,
      name: 'Discours',
      section: '',
      order: 1,
      durationMin: 30,
      congregationId,
      allowedRoles: {
        create: [
          { roleId, asKind: 'speaker', congregationId },
          { roleId, asKind: 'reader', congregationId },
        ],
      },
    },
  })
  const service = await db.eventServicePart.create({
    data: {
      eventId: event.id,
      servicePartId,
      name: 'Sono',
      order: 1,
      congregationId,
      allowedRoles: { create: [{ roleId, congregationId }] },
    },
  })
  await settleFixtureSchedules(db, congregationId)
  return { eventId: event.id, partId: part.id, serviceId: service.id }
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('old item tables mirrored into the new ones', () => {
  it('mirrors seeded templates and a programme made from one, with their allowed roles', async () => {
    await inCongregation(async ({ db, congregationId, actorId, inStep, templateId }) => {
      const midweek = await templateId('midweek-meeting')
      await createProgrammeOnDay(
        db,
        { templateId: midweek, day: '2027-04-08' },
        { congregationId, timezone: 'Europe/Paris', actorId },
      )

      expect(await db.templateItemAllowedRole.count()).toBeGreaterThan(0)
      expect(await db.item.count()).toBeGreaterThan(0)
      await inStep()
    })
  })

  it('follows an assignment, a cleared slot, a removed allowed role and items added by hand', async () => {
    await inCongregation(async ({ db, congregationId, actorId, inStep, templateId, roleId }) => {
      const midweek = await templateId('midweek-meeting')
      const templatePart = await db.templatePart.findFirstOrThrow({ where: { templateId: midweek } })
      const templateService = await db.templateServicePart.findFirstOrThrow({ where: { templateId: midweek } })
      const { eventId, partId } = await oldRowProgramme(db, {
        congregationId,
        actorId,
        roleId,
        templateId: midweek,
        partId: templatePart.id,
        servicePartId: templateService.id,
        day: '2027-04-08',
      })
      const member = await db.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })
      await db.eventPart.update({ where: { id: partId }, data: { assigneeId: member.id, topic: 'Matthieu 5' } })
      await db.eventServicePart.updateMany({ where: { eventId }, data: { assigneeId: member.id } })
      await inStep()

      await db.eventPart.update({ where: { id: partId }, data: { assigneeId: null } })
      await db.eventPartAllowedRole.deleteMany({ where: { eventPartId: partId } })
      await inStep()

      // Items the writers add: the new tables alone, so no old row to compare with.
      await addPartAssignment(
        db,
        {
          eventId,
          name: 'Discours',
          section: '',
          track: '',
          order: 99,
          durationMin: 30,
          allowExternalSpeaker: false,
          congregationId,
        },
        actorId,
      )
      await addServicePartAssignment(db, { eventId, name: 'Parking', allowedRoleIds: [], congregationId }, actorId)
      expect(await db.item.count({ where: { eventId, legacyPartId: null, schedule: { kind: 'programme' } } })).toBe(1)
      expect(await db.item.count({ where: { eventId, legacyServiceId: null, schedule: { kind: 'duty' } } })).toBe(1)
      await inStep()
    })
  })

  it('removes one slot of allowed roles and keeps the other, on templates, programmes and duties', async () => {
    await inCongregation(async ({ db, congregationId, actorId, inStep, templateId, roleId }) => {
      const midweek = await templateId('midweek-meeting')
      const templatePart = await db.templatePart.findFirstOrThrow({ where: { templateId: midweek } })
      const templateService = await db.templateServicePart.findFirstOrThrow({ where: { templateId: midweek } })
      const { partId, serviceId } = await oldRowProgramme(db, {
        congregationId,
        actorId,
        roleId,
        templateId: midweek,
        partId: templatePart.id,
        servicePartId: templateService.id,
        day: '2027-04-08',
      })

      // The template and the programme's old rows: the triggers mirror both.
      await setTemplatePartAllowedRoles(db, templatePart.id, 'reader', [], congregationId)
      await inStep()
      const slots = async (where: object) =>
        (await db.templateItemAllowedRole.findMany({ where, select: { slot: true } })).map(row => row.slot)
      expect(await slots({ item: { legacyPartId: templatePart.id }, roleId })).toEqual(['main'])

      // The programme's items are the writers' now: they write the new tables alone, so the old rows keep theirs.
      const part = await db.item.findUniqueOrThrow({ where: { legacyPartId: partId } })
      const service = await db.item.findUniqueOrThrow({ where: { legacyServiceId: serviceId } })
      await setPartAssignmentAllowedRoles(db, part.id, 'speaker', [], congregationId)
      await setServicePartAssignmentAllowedRoles(db, service.id, [], congregationId)
      const slotsOf = async (itemId: number) =>
        (await db.itemAllowedRole.findMany({ where: { itemId }, select: { slot: true } })).map(row => row.slot)
      expect(await slotsOf(part.id)).toEqual(['second'])
      expect(await slotsOf(service.id)).toEqual([])
    })
  })

  it('follows cascades and SET NULL: a member, a template part, a template applied, deleted events and templates', async () => {
    await inCongregation(async ({ db, congregationId, actorId, inStep, templateId, roleId }) => {
      const midweek = await templateId('midweek-meeting')
      const weekend = await templateId('weekend-meeting')
      const timing = { congregationId, timezone: 'Europe/Paris', actorId }
      const templatePart = await db.templatePart.findFirstOrThrow({ where: { templateId: midweek } })
      const templateService = await db.templateServicePart.findFirstOrThrow({ where: { templateId: midweek } })
      const { eventId: first } = await oldRowProgramme(db, {
        congregationId,
        actorId,
        roleId,
        templateId: midweek,
        partId: templatePart.id,
        servicePartId: templateService.id,
        day: '2027-04-08',
      })
      const { id: second } = await createProgrammeOnDay(db, { templateId: midweek, day: '2027-04-15' }, timing)
      const member = await db.member.create({ data: { firstname: 'Luc', lastname: 'ROUX', congregationId } })
      const speaker = await db.externalSpeaker.create({ data: { name: 'Jean DURAND', congregationId } })
      await db.eventServicePart.updateMany({ where: { eventId: first }, data: { assigneeId: member.id } })
      await db.eventPart.updateMany({ where: { eventId: first }, data: { externalSpeakerId: speaker.id } })
      await inStep()
      expect(await db.item.count({ where: { eventId: first, externalSpeakerId: speaker.id } })).toBeGreaterThan(0)

      // SET NULL from a member, an external speaker, a template part and a template service, each through its own
      // foreign key on the old table and on the new one.
      await db.member.delete({ where: { id: member.id } })
      await db.externalSpeaker.delete({ where: { id: speaker.id } })
      await db.templatePart.delete({ where: { id: templatePart.id } })
      await db.templateServicePart.delete({ where: { id: templateService.id } })
      await inStep()
      expect(await db.item.count({ where: { eventId: first, assigneeId: { not: null } } })).toBe(0)
      expect(await db.item.count({ where: { eventId: first, externalSpeakerId: { not: null } } })).toBe(0)
      // The programme's part and service, both made from the template rows just deleted.
      expect(await db.item.count({ where: { eventId: first, templateItemId: null } })).toBe(2)

      await applyTemplateToEvent(db, second, weekend, congregationId, actorId)
      const copy = await duplicateTemplate(db, weekend, congregationId, actorId)
      if (!copy) throw new Error('the template was not duplicated')
      expect(await db.templateItem.count({ where: { templateId: copy.id } })).toBeGreaterThan(0)
      await inStep()

      await bulkDeleteEvents(db, [first, second], congregationId, actorId)
      // The seeded templates cannot be deleted; the copy can.
      expect(await deleteTemplate(db, copy.id, congregationId, actorId)).toMatchObject({ ok: true })
      await inStep()
      expect(await db.item.count({ where: { eventId: { in: [first, second] } } })).toBe(0)
      expect(await db.templateItem.count({ where: { templateId: copy.id } })).toBe(0)
    })
  })

  it('refuses an allowed role of a slot it does not know rather than file it in the wrong one', async () => {
    await inCongregation(async ({ db, congregationId, templateId }) => {
      const part = await db.templatePart.findFirstOrThrow({
        where: { templateId: await templateId('midweek-meeting') },
      })
      const role = await db.role.create({ data: { key: `stray-${String(part.id)}`, name: 'stray', congregationId } })

      await expect(
        db.templatePartAllowedRole.create({
          data: { partId: part.id, roleId: role.id, asKind: 'host', congregationId },
        }),
      ).rejects.toThrow(UNKNOWN_KIND)
    })
  })
})
