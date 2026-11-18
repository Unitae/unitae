import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

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

const { reorderServiceAssignments, reorderTemplateServices } = await import('./reorder-services.server')

const ts = Date.now()
let congregationId: number
let eventId: number
let templateId: number
let eventServices: number[]
let otherEventService: number
let templateServices: number[]
let otherTemplateService: number

beforeAll(async () => {
  congregationId = (
    await testDb.congregation.create({
      data: { name: `Reorder services ${ts}`, slug: `reorder-services-${ts}`, active: true },
    })
  ).id

  await withScope(congregationId, async tx => {
    const day = new Date('2026-11-19T18:00:00Z')
    const event = (name: string) =>
      tx.event.create({ data: { name, startDate: day, endDate: day, congregationId } }).then(row => row.id)
    eventId = await event('This event')
    const otherEventId = await event('Other event')
    eventServices = []
    for (const [index, name] of ['Sono', 'Estrade', 'Accueil'].entries()) {
      eventServices.push(
        (await tx.eventServicePart.create({ data: { name, order: index * 5, eventId, congregationId } })).id,
      )
    }
    otherEventService = (
      await tx.eventServicePart.create({ data: { name: 'Elsewhere', eventId: otherEventId, congregationId } })
    ).id

    const template = (key: string) =>
      tx.eventTemplate.create({ data: { name: key, key: `${key}-${ts}`, congregationId } }).then(row => row.id)
    templateId = await template('this')
    const otherTemplateId = await template('other')
    templateServices = []
    for (const [index, name] of ['Sono', 'Estrade', 'Accueil'].entries()) {
      templateServices.push(
        (
          await tx.templateServicePart.create({
            data: { name, key: name.toLowerCase(), order: index * 5, templateId, congregationId },
          })
        ).id,
      )
    }
    otherTemplateService = (
      await tx.templateServicePart.create({
        data: { name: 'Elsewhere', key: 'elsewhere', templateId: otherTemplateId, congregationId },
      })
    ).id
  })
})

afterAll(async () => {
  if (congregationId) {
    await withScope(congregationId, async tx => {
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: congregationId } })
  }
  await testDb.$disconnect()
})

const eventOrder = () =>
  withScope(congregationId, tx =>
    tx.eventServicePart.findMany({ orderBy: { id: 'asc' }, select: { id: true, order: true } }),
  )
const templateOrder = () =>
  withScope(congregationId, tx =>
    tx.templateServicePart.findMany({ orderBy: { id: 'asc' }, select: { id: true, order: true } }),
  )

// The routes authorise the caller on one event or template; the ids come from the request. A service of another event
// or template must not move on the strength of that check, and a list that leaves one of this event's services out
// would leave it tied with the moved ones: in both cases nothing moves.
describe('reorderServiceAssignments', () => {
  it("puts the event's services in the given order", async () => {
    const [sono, estrade, accueil] = eventServices
    const done = await withScope(congregationId, tx =>
      reorderServiceAssignments(tx, congregationId, eventId, [accueil, sono, estrade]),
    )
    expect(done).toBe(true)
    const orders = new Map((await eventOrder()).map(service => [service.id, service.order]))
    expect([orders.get(accueil), orders.get(sono), orders.get(estrade)]).toEqual([0, 5, 10])
  })

  it('refuses, moving nothing, when a service of another event is among the ids', async () => {
    const before = await eventOrder()
    const done = await withScope(congregationId, tx =>
      reorderServiceAssignments(tx, congregationId, eventId, [otherEventService, ...eventServices]),
    )
    expect(done).toBe(false)
    expect(await eventOrder()).toEqual(before)
  })

  it('refuses, moving nothing, a list that leaves one of the services out or names one twice', async () => {
    const before = await eventOrder()
    const [sono, estrade] = eventServices
    const partial = await withScope(congregationId, tx =>
      reorderServiceAssignments(tx, congregationId, eventId, [estrade, sono]),
    )
    const doubled = await withScope(congregationId, tx =>
      reorderServiceAssignments(tx, congregationId, eventId, [estrade, sono, sono]),
    )
    expect([partial, doubled]).toEqual([false, false])
    expect(await eventOrder()).toEqual(before)
  })
})

describe('reorderTemplateServices', () => {
  it("puts the template's services in the given order", async () => {
    const [sono, estrade, accueil] = templateServices
    const done = await withScope(congregationId, tx =>
      reorderTemplateServices(tx, congregationId, templateId, [estrade, accueil, sono]),
    )
    expect(done).toBe(true)
    const orders = new Map((await templateOrder()).map(service => [service.id, service.order]))
    expect([orders.get(estrade), orders.get(accueil), orders.get(sono)]).toEqual([0, 5, 10])
  })

  it('refuses, moving nothing, when a service of another template is among the ids', async () => {
    const before = await templateOrder()
    const done = await withScope(congregationId, tx =>
      reorderTemplateServices(tx, congregationId, templateId, [...templateServices, otherTemplateService]),
    )
    expect(done).toBe(false)
    expect(await templateOrder()).toEqual(before)
  })

  it('refuses, moving nothing, a list that leaves one of the services out', async () => {
    const before = await templateOrder()
    const done = await withScope(congregationId, tx =>
      reorderTemplateServices(tx, congregationId, templateId, templateServices.slice(1)),
    )
    expect(done).toBe(false)
    expect(await templateOrder()).toEqual(before)
  })
})
