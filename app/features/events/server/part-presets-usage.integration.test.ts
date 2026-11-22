import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { settleFixtureSchedules } from '~/tests/helpers/settle-fixture-schedules'

// The part types' usage on the settings page, against real rows (plan T12): template parts, and programme parts read
// from items. A duty carrying the same type is not a part and never counts.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { listPartPresetsForSettings } = await import('./part-presets.queries')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('part types in use', () => {
  it('counts the template parts and the programme parts of a type, never a duty', async () => {
    let usage: { templateParts: number; items: number } | undefined
    try {
      await testDb.$transaction(async tx => {
        const stamp = `presets-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const preset = await tx.partPreset.create({
          data: { key: `reading-${stamp}`, name: 'Lecture', congregationId },
        })
        const template = await tx.eventTemplate.create({ data: { name: 'Semaine', key: `w-${stamp}`, congregationId } })
        await tx.templatePart.create({
          data: { name: 'Lecture', order: 0, templateId: template.id, presetId: preset.id, congregationId },
        })
        const event = await tx.event.create({
          data: {
            name: 'Réunion',
            startDate: new Date('2027-05-06T18:00:00Z'),
            endDate: new Date('2027-05-06T19:45:00Z'),
            templateId: template.id,
            congregationId,
          },
        })
        for (const name of ['Lecture', 'Lecture bis']) {
          await tx.eventPart.create({ data: { name, eventId: event.id, presetId: preset.id, congregationId } })
        }
        await tx.eventServicePart.create({
          data: { name: 'Sono', eventId: event.id, presetId: preset.id, congregationId },
        })

        await settleFixtureSchedules(tx as unknown as TransactionClient, congregationId)
        const rows = await listPartPresetsForSettings(tx as unknown as TransactionClient, congregationId)
        usage = rows.find(row => row.id === preset.id)?._count
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }

    expect(usage).toEqual({ templateParts: 1, items: 2 })
  })
})
