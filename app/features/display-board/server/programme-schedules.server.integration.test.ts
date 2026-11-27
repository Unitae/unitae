import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import type { TransactionClient } from '~/shared/infra/db.server'

// A meeting may hold several duties schedules (user, 2026-11-27): a programme document shows those its settings choose,
// each under its name. A meeting with « Sono » (unnamed, from the template « Sono ») and « Nettoyage », both published.
// In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { getDynamicDocumentData } = await import('./dynamic-documents.server')
const { kindDutyTemplates, programmeServiceSchedules } = await import('./programme-schedules.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

interface Read {
  /** What the document's settings offer to choose for the type: its duties templates, in its order. */
  offered: { title: string | null }[]
  all: string[]
  chosen: string[]
  titles: { title: string | null; order: number }[]
}

async function read(): Promise<Read> {
  let out: Read | undefined
  try {
    await testDb.$transaction(async tx => {
      const stamp = `board-schedules-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
      const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
      await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
      const db = tx as unknown as TransactionClient
      const kindId = (await tx.eventTemplate.create({ data: { name: 'Week-end', key: stamp, congregationId } })).id
      const template = (name: string) =>
        tx.scheduleTemplate.create({ data: { name, kind: 'duty', congregationId } }).then(row => row.id)
      const [sono, cleaning] = [await template('Sono'), await template('Nettoyage')]
      const day = new Date(Date.now() + 7 * 86_400_000)
      const eventId = (
        await tx.event.create({
          data: {
            name: 'Réunion',
            startDate: day,
            endDate: day,
            status: 'released',
            templateId: kindId,
            congregationId,
          },
        })
      ).id
      const schedule = (scheduleTemplateId: number, order: number, name: string | null, key: string | null) =>
        tx.schedule
          .create({
            data: { eventId, kind: 'duty', order, status: 'published', name, key, scheduleTemplateId, congregationId },
          })
          .then(row => row.id)
      const first = await schedule(sono, 1, null, 'services')
      const second = await schedule(cleaning, 2, 'Nettoyage', null)
      const item = (scheduleId: number, name: string, order: number) =>
        tx.item.create({ data: { eventId, scheduleId, name, order, congregationId } })
      await item(first, 'Micros', 0)
      await item(second, 'Salle', 0)
      await item(first, 'Estrade', 5)
      const servicesWith = async (dutyTemplates?: number[]) => {
        const data = await getDynamicDocumentData(db, DynamicType.Programme, null, congregationId, {
          dynamicConfig: {
            templates: [
              { templateId: kindId, parts: false, services: true, ...(dutyTemplates ? { dutyTemplates } : {}) },
            ],
            groupBy: 'date',
          },
        })
        if (data?.type !== DynamicType.Programme) throw new Error('not a programme')
        return data.events.flatMap(event => (event.eventServiceParts ?? []).map(service => service.name))
      }
      await tx.eventKindScheduleTemplate.createMany({
        data: [
          { eventKindId: kindId, scheduleTemplateId: cleaning, order: 1, congregationId },
          { eventKindId: kindId, scheduleTemplateId: sono, order: 0, congregationId },
        ],
      })
      const titles = await programmeServiceSchedules(db, [eventId], congregationId)
      const offered = (await kindDutyTemplates(db, congregationId))[kindId] ?? []
      out = {
        offered: offered.map(each => ({ title: each.title, id: each.id === sono ? 'sono' : 'cleaning' })) as never,
        all: await servicesWith(),
        chosen: await servicesWith([cleaning]),
        titles: [titles[first], titles[second]].map(each => ({ title: each?.title ?? null, order: each?.order ?? -1 })),
      }
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  if (out == null) throw new Error('nothing read')
  return out
}

describe('a programme document with two duties schedules', () => {
  it('shows every duties schedule unless its settings choose, then only those, each titled', async () => {
    expect(await read()).toEqual({
      offered: [
        { title: 'Sono', id: 'sono' },
        { title: 'Nettoyage', id: 'cleaning' },
      ],
      all: ['Micros', 'Salle', 'Estrade'],
      chosen: ['Salle'],
      titles: [
        { title: 'Sono', order: 1 },
        { title: 'Nettoyage', order: 2 },
      ],
    })
  })
})
