import { PrismaPg } from '@prisma/adapter-pg'
import JsZip from 'jszip'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { EntityIdMap } from './data-transfer.type'
import { writeNdjsonFile } from './ndjson-archive'

// Restoring the items of a schedule template no kind uses (2.23): a part or a service with no kind comes back under
// its schedule template; one whose template did not come is left out, as an item whose kind did not come always was.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { importKindScheduleTemplates, importScheduleTemplates, settleImportedSchedules } = await import(
  './import-schedules.server'
)
const { importTemplateParts, importTemplateServiceParts } = await import('./import-event-templates.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('restoring a schedule template no kind uses', () => {
  it('brings its parts and services back as its own', async () => {
    let read: { parts: string[]; services: string[] } | undefined
    try {
      await testDb.$transaction(async tx => {
        const stamp = `ikl-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const db = tx as unknown as TransactionClient
        const zip = new JsZip()
        writeNdjsonFile(zip, 'schedule-templates', [
          { id: 21, name: 'Visite', key: null, kind: 'programme', responsibleRoleId: null },
          { id: 22, name: 'Visioconférence', key: null, kind: 'duty', responsibleRoleId: null },
        ])
        writeNdjsonFile(zip, 'kind-schedule-templates', [])
        const part = { section: 'Matin', track: '', durationMin: 5, allowExternalSpeaker: false, templateId: null }
        writeNdjsonFile(zip, 'programme-template-parts', [
          { id: 1, name: 'Discours', order: 0, scheduleTemplateId: 21, ...part },
          // Its schedule template did not come.
          { id: 2, name: 'Perdu', order: 1, scheduleTemplateId: 99, ...part },
        ])
        writeNdjsonFile(zip, 'programme-template-service-roles', [
          { id: 5, name: 'Zoom', key: 'zoom', order: 0, templateId: null, scheduleTemplateId: 22 },
        ])
        const idMap = new EntityIdMap()
        await importScheduleTemplates(zip, db, idMap, congregationId)
        await importKindScheduleTemplates(zip, db, idMap, congregationId)
        await importTemplateParts(zip, db, idMap, congregationId)
        await importTemplateServiceParts(zip, db, idMap, congregationId)
        await settleImportedSchedules(zip, db, congregationId)

        const label = async (scheduleTemplateId: number | null, item: { name: string; templateId: number | null }) => {
          const template = await tx.scheduleTemplate.findFirst({ where: { id: scheduleTemplateId ?? -1 } })
          return `${template?.name ?? '-'}:${item.name}:${item.templateId ?? 'no kind'}`
        }
        const parts = await tx.templatePart.findMany({ where: { congregationId }, orderBy: { id: 'asc' } })
        const services = await tx.templateServicePart.findMany({ where: { congregationId } })
        read = {
          parts: await Promise.all(parts.map(each => label(each.scheduleTemplateId, each))),
          services: await Promise.all(services.map(each => label(each.scheduleTemplateId, each))),
        }
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    expect(read).toEqual({ parts: ['Visite:Discours:no kind'], services: ['Visioconférence:Zoom:no kind'] })
  })
})
