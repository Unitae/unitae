import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// The board prints a meeting's services in their order, on screen and in the PDF, both read through this data. The
// services are created in one order and ordered in another, so a reader sorting by id, by name, or not at all shows it.

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

const { getDynamicDocumentData } = await import('./dynamic-documents.server')

const ts = Date.now()
const ids = { cong: 0, template: 0 }

beforeAll(async () => {
  ids.cong = (
    await testDb.congregation.create({
      data: { name: `Board services ${ts}`, slug: `board-services-${ts}`, active: true },
    })
  ).id
  await withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    ids.template = (
      await tx.eventTemplate.create({ data: { name: 'Réunion de semaine', key: 'midweek-meeting', congregationId } })
    ).id
    const day = new Date(Date.now() + 5 * 86_400_000)
    const event = await tx.event.create({
      data: {
        name: 'Réunion de semaine',
        startDate: day,
        endDate: day,
        status: 'released',
        templateId: ids.template,
        congregationId,
      },
    })
    for (const [name, order] of [
      ['Nettoyage', 20],
      ['Accueil', 10],
      ['Sono', 0],
    ] as const) {
      await tx.eventServicePart.create({ data: { name, order, eventId: event.id, congregationId } })
    }
  })
})

afterAll(async () => {
  if (ids.cong) {
    await withScope(ids.cong, async tx => {
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: ids.cong } })
  }
  await testDb.$disconnect()
})

describe('the board programme', () => {
  it('lists a meeting’s services in their order, by configuration and by template key', async () => {
    const config = { templates: [{ templateId: ids.template, parts: true, services: true }], groupBy: 'date' }
    const services = (data: Awaited<ReturnType<typeof getDynamicDocumentData>>) =>
      (data && 'events' in data ? (data.events ?? []) : []).map(event =>
        (event.eventServiceParts ?? []).map(service => service.name),
      )

    const byConfig = await withScope(ids.cong, tx =>
      getDynamicDocumentData(tx, 'programme', null, ids.cong, { showServices: true, dynamicConfig: config }),
    )
    const byKey = await withScope(ids.cong, tx =>
      getDynamicDocumentData(tx, 'programme', 'midweek-meeting', ids.cong, { showServices: true }),
    )

    expect(services(byConfig)).toEqual([['Sono', 'Accueil', 'Nettoyage']])
    expect(services(byKey)).toEqual([['Sono', 'Accueil', 'Nettoyage']])
  })
})
