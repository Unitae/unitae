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

const { addServicePartAssignment, applyTemplateToEvent } = await import('./event-parts.server')
const { upsertTemplateServicePart } = await import('./event-templates.server')
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
    // An order the names and the ids do not follow: whoever copies them must read the order itself.
    for (const [name, order] of [
      ['Accueil', 10],
      ['Sono', 0],
      ['Nettoyage', 15],
      ['Estrade', 5],
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

function eventServices(tx: Tx, eventId: number) {
  return tx.eventServicePart
    .findMany({ where: { eventId }, orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { name: true } })
    .then(rows => rows.map(row => row.name))
}

function templateServices(tx: Tx, templateId: number) {
  return tx.templateServicePart
    .findMany({ where: { templateId }, orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { name: true } })
    .then(rows => rows.map(row => row.name))
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

    expect(names).toEqual(['Sono', 'Estrade', 'Accueil', 'Nettoyage'])
  })

  it('copies the template’s order when a meeting gets its programme', async () => {
    const names = await withScope(ids.cong, async tx => {
      const event = await newEvent(tx, 'Réunion', ids.template)
      await createMeetingProgramme(tx, event.id, { congregationId: ids.cong, timezone: 'Europe/Paris', actorId: 1 })
      return eventServices(tx, event.id)
    })

    expect(names).toEqual(['Sono', 'Estrade', 'Accueil', 'Nettoyage'])
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

    expect(names).toEqual(['Sono', 'Estrade', 'Accueil', 'Nettoyage', 'Micros'])
  })

  it('puts a service added to a template last, and keeps its place when it is renamed', async () => {
    const names = await withScope(ids.cong, async tx => {
      const template = await tx.eventTemplate.create({
        data: { name: 'Week-end', key: `weekend-${ts}`, congregationId: ids.cong },
      })
      const sono = await upsertTemplateServicePart(
        tx,
        template.id,
        { name: 'Sono', key: 'sono', allowedRoleIds: [] },
        ids.cong,
        ids.actor,
      )
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

    expect(names).toEqual(['Audio-vidéo', 'Accueil'])
  })

  it('keeps the order in a duplicated template', async () => {
    const names = await withScope(ids.cong, async tx => {
      const copy = await duplicateTemplate(tx, ids.template, ids.cong, ids.actor)
      return copy ? templateServices(tx, copy.id) : []
    })

    expect(names).toEqual(['Sono', 'Estrade', 'Accueil', 'Nettoyage'])
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
