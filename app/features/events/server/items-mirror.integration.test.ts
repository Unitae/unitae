import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { readNewItems, readOldItems } from '~/tests/helpers/item-mirror'

// Parts and duties become one item (plan T12): until the writers move over, triggers copy every write of the eight old
// item tables into TemplateItem, Item and their allowed roles. These run the app's writers and direct Prisma writes under
// the tenant scope, as the app's database role where DB_RUNTIME_URL names it (CI does), and compare the two shapes after
// each step.

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
  /** Fails the test unless the new tables hold exactly what the old ones do. */
  inStep: () => Promise<void>
  templateId: (key: string) => Promise<number>
  /** The role the fixture allows in every slot. */
  roleId: number
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
            expect(mirrored).toEqual(old)
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
    await inCongregation(async ({ db, congregationId, actorId, inStep, templateId }) => {
      const { id: eventId } = await createProgrammeOnDay(
        db,
        { templateId: await templateId('midweek-meeting'), day: '2027-04-08' },
        { congregationId, timezone: 'Europe/Paris', actorId },
      )
      const member = await db.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })
      const part = await db.eventPart.findFirstOrThrow({ where: { eventId, allowedRoles: { some: {} } } })
      await db.eventPart.update({ where: { id: part.id }, data: { assigneeId: member.id, topic: 'Matthieu 5' } })
      await db.eventServicePart.updateMany({ where: { eventId }, data: { assigneeId: member.id } })
      await inStep()

      await db.eventPart.update({ where: { id: part.id }, data: { assigneeId: null } })
      await db.eventPartAllowedRole.deleteMany({ where: { eventPartId: part.id } })
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
      await inStep()
    })
  })

  it('removes one slot of allowed roles and keeps the other, on templates, programmes and duties', async () => {
    await inCongregation(async ({ db, congregationId, actorId, inStep, templateId, roleId }) => {
      const midweek = await templateId('midweek-meeting')
      const { id: eventId } = await createProgrammeOnDay(
        db,
        { templateId: midweek, day: '2027-04-08' },
        { congregationId, timezone: 'Europe/Paris', actorId },
      )
      const templatePart = await db.templatePart.findFirstOrThrow({ where: { templateId: midweek } })
      const part = await db.eventPart.findFirstOrThrow({ where: { eventId, allowedRoles: { some: {} } } })
      const service = await db.eventServicePart.findFirstOrThrow({ where: { eventId, allowedRoles: { some: {} } } })

      await setTemplatePartAllowedRoles(db, templatePart.id, 'reader', [], congregationId)
      await setPartAssignmentAllowedRoles(db, part.id, 'speaker', [], congregationId)
      await setServicePartAssignmentAllowedRoles(db, service.id, [], congregationId)

      await inStep()
      const slots = async (where: object) =>
        (await db.templateItemAllowedRole.findMany({ where, select: { slot: true } })).map(row => row.slot)
      expect(await slots({ item: { legacyPartId: templatePart.id }, roleId })).toEqual(['main'])
      expect(
        (await db.itemAllowedRole.findMany({ where: { item: { legacyPartId: part.id } }, select: { slot: true } })).map(
          row => row.slot,
        ),
      ).toEqual(['second'])
      expect(await db.itemAllowedRole.count({ where: { item: { legacyServiceId: service.id } } })).toBe(0)
    })
  })

  it('follows cascades and SET NULL: a member, a template part, a template applied, deleted events and templates', async () => {
    await inCongregation(async ({ db, congregationId, actorId, inStep, templateId }) => {
      const midweek = await templateId('midweek-meeting')
      const weekend = await templateId('weekend-meeting')
      const timing = { congregationId, timezone: 'Europe/Paris', actorId }
      const { id: first } = await createProgrammeOnDay(db, { templateId: midweek, day: '2027-04-08' }, timing)
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
      await db.templatePart.delete({
        where: { id: (await db.templatePart.findFirstOrThrow({ where: { templateId: midweek } })).id },
      })
      await db.templateServicePart.delete({
        where: { id: (await db.templateServicePart.findFirstOrThrow({ where: { templateId: midweek } })).id },
      })
      await inStep()
      expect(await db.item.count({ where: { eventId: first, assigneeId: { not: null } } })).toBe(0)
      expect(await db.item.count({ where: { eventId: first, externalSpeakerId: { not: null } } })).toBe(0)
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
