import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Services have an order of their own, like parts: a template's services in the order its programmes start with, an
// event's in the order they print. Every writer keeps it: a service added goes last, a copy keeps its source's order.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

type Tx = Parameters<Parameters<typeof testDb.$transaction>[0]>[0]

function withScope<T>(congregationId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return testDb.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}

const { addServicePartAssignment } = await import('./event-parts.server')
const { applyTemplateToEvent } = await import('./apply-template.server')
const { getTemplateById } = await import('./event-templates.server')
const { upsertTemplateServicePart } = await import('./template-items.server')
const { getEventProgramme } = await import('./event-part-assignments.server')
const { duplicateTemplate } = await import('./duplicate-template.server')
const { createMeetingProgramme } = await import('./create-meeting-programme.server')
const { seedDefaultTemplates } = await import('./seed-templates.server')

const ts = Date.now()
const ids = { cong: 0, seededCong: 0, actor: 0, template: 0 }
const DAY = new Date('2026-11-19T17:00:00Z')

beforeAll(async () => {
  ids.cong = (await testDb.congregation.create({ data: { name: `Order ${ts}`, slug: `order-${ts}`, active: true } })).id
  ids.seededCong = (
    await testDb.congregation.create({ data: { name: `Seeded ${ts}`, slug: `seeded-${ts}`, active: true } })
  ).id
  await withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    ids.actor = (
      await tx.userAccount.create({ data: { email: `order-${ts}@test.com`, password: 'x', congregationId } })
    ).id
    ids.template = (
      await tx.eventTemplate.create({ data: { name: 'Semaine', key: `semaine-${ts}`, weekDay: 4, congregationId } })
    ).id
    // An order the names and the ids do not follow, with uneven gaps: whoever copies them must copy the values.
    for (const [name, order] of [
      ['Accueil', 30],
      ['Sono', 0],
      ['Nettoyage', 45],
      ['Estrade', 12],
    ] as const) {
      await tx.templateServicePart.create({
        data: { name, key: name.toLowerCase(), order, templateId: ids.template, congregationId },
      })
    }
  })
})

afterAll(async () => {
  for (const congregationId of [ids.cong, ids.seededCong]) {
    if (!congregationId) continue
    await withScope(congregationId, async tx => {
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.partPreset.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
    // Programme creation and duplication audit what they did.
    await testDb.auditLog.deleteMany({ where: { congregationId } })
    await testDb.congregation.deleteMany({ where: { id: congregationId } })
  }
  await testDb.$disconnect()
})

const BY_ORDER = { orderBy: [{ order: 'asc' as const }, { id: 'asc' as const }], select: { name: true, order: true } }

/** « order name » for each service: the values themselves, not only the sequence an id tie-break could produce. */
function eventServices(tx: Tx, eventId: number) {
  return tx.eventServicePart
    .findMany({ where: { eventId }, ...BY_ORDER })
    .then(rows => rows.map(row => `${row.order} ${row.name}`))
}

function templateServices(tx: Tx, templateId: number) {
  return tx.templateServicePart
    .findMany({ where: { templateId }, ...BY_ORDER })
    .then(rows => rows.map(row => `${row.order} ${row.name}`))
}

function newEvent(tx: Tx, name: string, templateId: number | null = null) {
  return tx.event.create({
    data: { name, startDate: DAY, endDate: DAY, templateId, createdById: ids.actor, congregationId: ids.cong },
  })
}

describe('the order of services', () => {
  it('copies the template’s order when a template is applied to an event', async () => {
    const names = await withScope(ids.cong, async tx => {
      const event = await newEvent(tx, 'Appliqué')
      await applyTemplateToEvent(tx, event.id, ids.template, ids.cong, ids.actor)
      return eventServices(tx, event.id)
    })

    expect(names).toEqual(['0 Sono', '12 Estrade', '30 Accueil', '45 Nettoyage'])
  })

  it('copies the template’s order when a meeting gets its programme', async () => {
    const names = await withScope(ids.cong, async tx => {
      const event = await newEvent(tx, 'Réunion', ids.template)
      await createMeetingProgramme(tx, event.id, { congregationId: ids.cong, timezone: 'Europe/Paris', actorId: 1 })
      return eventServices(tx, event.id)
    })

    expect(names).toEqual(['0 Sono', '12 Estrade', '30 Accueil', '45 Nettoyage'])
  })

  it('puts a service added to an event after the ones it has', async () => {
    const names = await withScope(ids.cong, async tx => {
      const event = await newEvent(tx, 'Ajout')
      await applyTemplateToEvent(tx, event.id, ids.template, ids.cong, ids.actor)
      await addServicePartAssignment(
        tx,
        { eventId: event.id, name: 'Micros', allowedRoleIds: [], congregationId: ids.cong },
        ids.actor,
      )
      return eventServices(tx, event.id)
    })

    expect(names).toEqual(['0 Sono', '12 Estrade', '30 Accueil', '45 Nettoyage', '50 Micros'])
  })

  it('puts a service added to a template last, and keeps its place when it is renamed', async () => {
    const names = await withScope(ids.cong, async tx => {
      const template = await tx.eventTemplate.create({
        data: { name: 'Week-end', key: `weekend-${ts}`, congregationId: ids.cong },
      })
      // Already there, at 10: a new service goes after it, not at 0 before it.
      const sono = await tx.templateServicePart.create({
        data: { name: 'Sono', key: 'sono', order: 10, templateId: template.id, congregationId: ids.cong },
      })
      await upsertTemplateServicePart(
        tx,
        template.id,
        { name: 'Accueil', key: 'accueil', allowedRoleIds: [] },
        ids.cong,
        ids.actor,
      )
      await upsertTemplateServicePart(
        tx,
        template.id,
        { id: sono.id, name: 'Audio-vidéo', key: 'sono', allowedRoleIds: [] },
        ids.cong,
        ids.actor,
      )
      return templateServices(tx, template.id)
    })

    expect(names).toEqual(['10 Audio-vidéo', '15 Accueil'])
  })

  it('keeps the order in a duplicated template', async () => {
    const names = await withScope(ids.cong, async tx => {
      const copy = await duplicateTemplate(tx, ids.template, ids.cong, ids.actor)
      return copy ? templateServices(tx, copy.id) : []
    })

    expect(names).toEqual(['0 Sono', '12 Estrade', '30 Accueil', '45 Nettoyage'])
  })

  // Created in one order, ordered in another: a reader that sorted by id, by name, or not at all would show it.
  it('shows the services in their order on the event and template pages', async () => {
    const read = await withScope(ids.cong, async tx => {
      const event = await newEvent(tx, 'Lecture')
      for (const [name, order] of [
        ['Nettoyage', 20],
        ['Accueil', 10],
        ['Zoom', 0],
      ] as const) {
        await tx.eventServicePart.create({ data: { name, order, eventId: event.id, congregationId: ids.cong } })
      }
      const page = await getEventProgramme(tx, event.id, ids.cong)
      const template = await getTemplateById(tx, ids.template, ids.cong)
      return {
        event: page?.eventServiceParts.map(service => service.name),
        template: template?.serviceParts.map(service => service.name),
      }
    })

    expect(read).toEqual({
      event: ['Zoom', 'Accueil', 'Nettoyage'],
      template: ['Sono', 'Estrade', 'Accueil', 'Nettoyage'],
    })
  })

  // Ties go by the old row's id (order_services), and a programme's parts with the same order and track position too,
  // even where the items were written in another order than the rows they mirror.
  it('breaks ties by the order the rows were created in, whatever order their items were written in', async () => {
    const read = await withScope(ids.cong, async tx => {
      const event = await newEvent(tx, 'Égalités')
      const congregationId = ids.cong
      const first = await tx.eventServicePart.create({
        data: { name: 'A', order: 0, eventId: event.id, congregationId },
      })
      await tx.eventServicePart.create({ data: { name: 'B', order: 0, eventId: event.id, congregationId } })
      const lead = await tx.eventPart.create({ data: { name: 'P1', order: 5, eventId: event.id, congregationId } })
      await tx.eventPart.create({ data: { name: 'P2', order: 5, eventId: event.id, congregationId } })
      await tx.eventPart.create({ data: { name: 'P0', order: 5, trackOrder: 1, eventId: event.id, congregationId } })
      // The first row of each pair gets its item back with a newer id than the second's.
      await tx.item.deleteMany({ where: { OR: [{ legacyServiceId: first.id }, { legacyPartId: lead.id }] } })
      await tx.eventServicePart.update({ where: { id: first.id }, data: { note: '' } })
      await tx.eventPart.update({ where: { id: lead.id }, data: { note: '' } })
      const page = await getEventProgramme(tx, event.id, congregationId)
      return {
        services: page?.eventServiceParts.map(service => service.name),
        parts: page?.eventParts.map(part => part.name),
      }
    })

    expect(read).toEqual({ services: ['A', 'B'], parts: ['P0', 'P1', 'P2'] })
  })

  it('seeds the services of a new congregation in the order they are listed', async () => {
    const orders = await withScope(ids.seededCong, async tx => {
      await seedDefaultTemplates(tx, ids.seededCong, 'fr')
      const template = await tx.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })
      const rows = await tx.templateServicePart.findMany({
        where: { templateId: template.id },
        orderBy: { id: 'asc' },
        select: { key: true, order: true },
      })
      return rows.map(row => `${row.order} ${row.key}`)
    })

    expect(orders).toEqual(['0 sono', '5 stage', '10 welcome', '15 cleaning'])
  })
})
