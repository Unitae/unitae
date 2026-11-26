import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { cleanCongregationData } from './seed-demo'

// The demo's cleanup empties a congregation it seeds again: a schedule template no kind uses holds its items, which
// must go before it (TemplatePart_owner_check). In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DB_URL, max: 3, connectionTimeoutMillis: 5000 }),
})

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('cleanCongregationData', () => {
  it('empties a schedule template no kind uses, items first', async () => {
    let left: number[] | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `clean-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          const own = await tx.scheduleTemplate.create({ data: { name: 'Visite', kind: 'programme', congregationId } })
          await tx.templatePart.create({
            data: { name: 'Discours', section: '', track: '', order: 0, scheduleTemplateId: own.id, congregationId },
          })
          const duties = await tx.scheduleTemplate.create({ data: { name: 'Zoom', kind: 'duty', congregationId } })
          await tx.templateServicePart.create({
            data: { name: 'Zoom', key: 'zoom', scheduleTemplateId: duties.id, congregationId },
          })
          await cleanCongregationData(tx as unknown as PrismaClient, congregationId)
          left = [
            await tx.scheduleTemplate.count({ where: { congregationId } }),
            await tx.templatePart.count({ where: { congregationId } }),
            await tx.templateServicePart.count({ where: { congregationId } }),
          ]
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    expect(left).toEqual([0, 0, 0])
  })
})
