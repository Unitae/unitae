import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
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

const { reorderPartAssignments } = await import('./event-parts.server')
const { reorderTemplateParts } = await import('./event-templates.server')

const ts = Date.now()
let congregationId: number
let eventId: number
let otherEventId: number
let templateId: number
let otherTemplateId: number
let eventParts: number[]
let otherEventPart: number
let templateParts: number[]
let otherTemplatePart: number

beforeAll(async () => {
  const congregation = await testDb.congregation.create({
    data: { name: `Reorder ${ts}`, slug: `reorder-${ts}`, active: true },
  })
  congregationId = congregation.id

  await withScope(congregationId, async tx => {
    const author = await tx.userAccount.create({
      data: {
        email: `reorder-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Rita',
        lastname: 'Reorder',
        active: true,
        congregationId,
      },
    })
    const eventDefaults = {
      startDate: new Date('2026-09-08T17:00:00Z'),
      endDate: new Date('2026-09-08T19:00:00Z'),
      createdById: author.id,
      congregationId,
    }
    eventId = (await tx.event.create({ data: { name: 'This event', ...eventDefaults } })).id
    otherEventId = (await tx.event.create({ data: { name: 'Other event', ...eventDefaults } })).id
    eventParts = []
    for (const [order, name] of ['Cantique', 'Discours', 'Lecture'].entries()) {
      eventParts.push((await tx.eventPart.create({ data: { name, order, eventId, congregationId } })).id)
    }
    otherEventPart = (
      await tx.eventPart.create({ data: { name: 'Elsewhere', order: 0, eventId: otherEventId, congregationId } })
    ).id

    templateId = (await tx.eventTemplate.create({ data: { name: 'This template', key: `this-${ts}`, congregationId } }))
      .id
    otherTemplateId = (
      await tx.eventTemplate.create({ data: { name: 'Other template', key: `other-${ts}`, congregationId } })
    ).id
    templateParts = []
    for (const [order, name] of ['Cantique', 'Discours', 'Lecture'].entries()) {
      templateParts.push((await tx.templatePart.create({ data: { name, order, templateId, congregationId } })).id)
    }
    otherTemplatePart = (
      await tx.templatePart.create({
        data: { name: 'Elsewhere', order: 0, templateId: otherTemplateId, congregationId },
      })
    ).id
  })
})

afterAll(async () => {
  if (congregationId) {
    await withScope(congregationId, async tx => {
      await tx.eventPart.deleteMany({})
      await tx.event.deleteMany({})
      await tx.templatePart.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: congregationId } })
  }
  await testDb.$disconnect()
})

const eventOrder = () =>
  withScope(congregationId, tx =>
    tx.eventPart.findMany({ where: { congregationId }, orderBy: { id: 'asc' }, select: { id: true, order: true } }),
  )
const templateOrder = () =>
  withScope(congregationId, tx =>
    tx.templatePart.findMany({ where: { congregationId }, orderBy: { id: 'asc' }, select: { id: true, order: true } }),
  )

// The routes authorise the caller on one event or template; the ids come from the request. A part of another event
// or template must not be moved on the strength of that check, and nothing must move when one is slipped in.
describe('reorderPartAssignments', () => {
  it("puts the event's parts in the given order", async () => {
    const [cantique, discours, lecture] = eventParts
    const done = await withScope(congregationId, tx =>
      reorderPartAssignments(tx, congregationId, eventId, [discours, cantique, lecture]),
    )
    expect(done).toBe(true)
    const orders = new Map((await eventOrder()).map(part => [part.id, part.order]))
    expect([orders.get(discours), orders.get(cantique), orders.get(lecture)]).toEqual([0, 5, 10])
  })

  it('refuses, moving nothing, when a part of another event is among the ids', async () => {
    const before = await eventOrder()
    const done = await withScope(congregationId, tx =>
      reorderPartAssignments(tx, congregationId, eventId, [otherEventPart, ...eventParts]),
    )
    expect(done).toBe(false)
    expect(await eventOrder()).toEqual(before)
  })
})

describe('reorderTemplateParts', () => {
  it("puts the template's parts in the given order", async () => {
    const [cantique, discours, lecture] = templateParts
    const done = await withScope(congregationId, tx =>
      reorderTemplateParts(tx, congregationId, templateId, [lecture, discours, cantique]),
    )
    expect(done).toBe(true)
    const orders = new Map((await templateOrder()).map(part => [part.id, part.order]))
    expect([orders.get(lecture), orders.get(discours), orders.get(cantique)]).toEqual([0, 5, 10])
  })

  it('refuses, moving nothing, when a part of another template is among the ids', async () => {
    const before = await templateOrder()
    const done = await withScope(congregationId, tx =>
      reorderTemplateParts(tx, congregationId, templateId, [...templateParts, otherTemplatePart]),
    )
    expect(done).toBe(false)
    expect(await templateOrder()).toEqual(before)
  })
})
