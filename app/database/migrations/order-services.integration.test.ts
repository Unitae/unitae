import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Runs against DB_URL rather than DB_RUNTIME_URL: a migration executes as the schema owner. Its statements are read from
// the shipped file and run inside a rolled-back transaction.
const adapter = new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 })
const testDb = new PrismaClient({ adapter })

const STATEMENTS = readFileSync(join(import.meta.dirname, '20261119090000_order_services', 'migration.sql'), 'utf8')
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement.length > 0)

class Rollback extends Error {}

interface Orders {
  template: string[]
  otherTemplate: string[]
  event: string[]
  afterSecondRun: string[]
}

let memo: Promise<Orders> | undefined

/** Services created in an order their names do not follow, all at order 0 as the column's default leaves them. */
function snapshot(): Promise<Orders> {
  memo ??= (async () => {
    let result: Orders | undefined
    try {
      await testDb.$transaction(async tx => {
        const stamp = `order-services-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        const template = await tx.eventTemplate.create({ data: { name: 'Semaine', key: `${stamp}-a`, congregationId } })
        const other = await tx.eventTemplate.create({ data: { name: 'Week-end', key: `${stamp}-b`, congregationId } })
        for (const name of ['Sono', 'Estrade', 'Accueil', 'Nettoyage']) {
          await tx.templateServicePart.create({ data: { name, key: name, templateId: template.id, congregationId } })
        }
        for (const name of ['Zoom', 'Audio']) {
          await tx.templateServicePart.create({ data: { name, key: name, templateId: other.id, congregationId } })
        }
        const day = new Date('2026-11-17T18:00:00Z')
        const event = await tx.event.create({
          data: { name: 'Réunion', startDate: day, endDate: day, templateId: template.id, congregationId },
        })
        for (const name of ['Sono', 'Accueil', 'Estrade']) {
          await tx.eventServicePart.create({ data: { name, eventId: event.id, congregationId } })
        }

        const byOrder = async (model: 'template' | 'event', id: number) => {
          const rows =
            model === 'template'
              ? await tx.templateServicePart.findMany({
                  where: { templateId: id },
                  select: { name: true, order: true },
                  orderBy: [{ order: 'asc' }, { name: 'asc' }],
                })
              : await tx.eventServicePart.findMany({
                  where: { eventId: id },
                  select: { name: true, order: true },
                  orderBy: [{ order: 'asc' }, { name: 'asc' }],
                })
          return rows.map(row => `${row.order} ${row.name}`)
        }

        for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
        const first = {
          template: await byOrder('template', template.id),
          otherTemplate: await byOrder('template', other.id),
          event: await byOrder('event', event.id),
        }
        for (const statement of STATEMENTS) await tx.$executeRawUnsafe(statement)
        result = { ...first, afterSecondRun: await byOrder('template', template.id) }
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    return result as Orders
  })()
  return memo
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('20261119090000_order_services', () => {
  it('keeps each template’s services in the order they were created, five apart', async () => {
    const { template, otherTemplate } = await snapshot()

    expect(template).toEqual(['0 Sono', '5 Estrade', '10 Accueil', '15 Nettoyage'])
    // Each template counts from 0 on its own.
    expect(otherTemplate).toEqual(['0 Zoom', '5 Audio'])
  })

  it('keeps each event’s services in the order they were created', async () => {
    const { event } = await snapshot()

    expect(event).toEqual(['0 Sono', '5 Accueil', '10 Estrade'])
  })

  it('changes nothing when run twice', async () => {
    const { template, afterSecondRun } = await snapshot()

    expect(afterSecondRun).toEqual(template)
  })
})
