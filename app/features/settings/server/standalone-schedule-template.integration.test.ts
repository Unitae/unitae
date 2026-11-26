import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

// A schedule template no kind uses (6a-1c-2) has items of its own: « Modèles de planning » writes its parts and
// services under no kind, mirrored into template items like any, its parts in its main room. It cannot be deleted from
// under them. In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { handleScheduleTemplateItem } = await import('./schedule-template-item-action.server')
const { getScheduleTemplateItems } = await import('./schedule-template-items.queries')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

interface Read {
  written: (string | undefined)[]
  parts: { name: string; section: string; templateId: number | null; mirrored: boolean; rooms: string[] }[]
  listed: string[]
  afterRename: string[]
  afterReorder: string[]
  afterDelete: string[]
  placed: string[]
  foreign: string | undefined
  foreignKept: boolean
  adopted: string[]
  services: { name: string; templateId: number | null; mirrored: boolean }[]
  deleteRefused: boolean
}

describe('a schedule template no kind uses', () => {
  it('has its parts and services written as its own, and keeps them', async () => {
    let read: Read | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `standalone-st-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const actor = {
            id: (await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } }))
              .id,
            congregationId,
          }
          const programme = await tx.scheduleTemplate.create({
            data: { name: 'Visite', kind: 'programme', congregationId },
          })
          const duties = await tx.scheduleTemplate.create({
            data: { name: 'Visioconférence', kind: 'duty', congregationId },
          })
          const part = (fields: Record<string, string>) =>
            handleScheduleTemplateItem(db, programme.id, form({ intent: 'upsert-part', ...fields }), actor)
          const written = [
            (await part({ partName: 'Discours', partSection: 'Matin', partOrder: '' }))?.kind,
            (await part({ partName: 'Prière', partSection: 'Matin', partOrder: '' }))?.kind,
            (
              await handleScheduleTemplateItem(
                db,
                duties.id,
                form({ intent: 'upsert-service-role', roleName: 'Zoom', roleKey: '' }),
                actor,
              )
            )?.kind,
          ]
          // Another template no kind uses, its part never among the first one's.
          const other = await tx.scheduleTemplate.create({ data: { name: 'Autre', kind: 'programme', congregationId } })
          await handleScheduleTemplateItem(
            db,
            other.id,
            form({ intent: 'upsert-part', partName: 'Ailleurs', partSection: 'Matin', partOrder: '' }),
            actor,
          )
          const names = async () => (await getScheduleTemplateItems(db, programme.id, congregationId))?.parts ?? []
          const rows = await tx.templatePart.findMany({
            where: { scheduleTemplateId: programme.id },
            orderBy: { order: 'asc' },
            include: { rooms: { include: { room: true } } },
          })
          const mirrors = await tx.templateItem.findMany({
            where: { congregationId },
            select: { legacyPartId: true, legacyServiceId: true },
          })
          const listed = (await names()).map(each => each.name)

          await handleScheduleTemplateItem(
            db,
            programme.id,
            form({ intent: 'rename-section', from: 'Matin', to: 'Après-midi' }),
            actor,
          )
          const afterRename = (await names()).map(each => each.section)
          const ids = rows.map(row => row.id)
          await handleScheduleTemplateItem(
            db,
            programme.id,
            form({ intent: 'reorder-parts', orderedIds: JSON.stringify([...ids].reverse()) }),
            actor,
          )
          const afterReorder = (await names()).map(each => each.name)
          await handleScheduleTemplateItem(
            db,
            programme.id,
            form({ intent: 'delete-part', partId: String(ids[0]) }),
            actor,
          )
          const afterDelete = (await names()).map(each => each.name)

          // Edited in place, then moved to a section another part carries; another template's part is not its own.
          await part({ partId: String(ids[1]), partName: 'Prière finale', partSection: 'Après-midi', partOrder: '' })
          await part({ partName: 'Cantique', partSection: 'Soir', partOrder: '' })
          await part({ partId: String(ids[1]), partName: 'Prière finale', partSection: 'Soir', partOrder: '' })
          const placed = (await names()).map(each => `${each.section}:${each.name}`)
          const elsewhere = await tx.templatePart.findFirstOrThrow({ where: { scheduleTemplateId: other.id } })
          const foreign = await handleScheduleTemplateItem(
            db,
            programme.id,
            form({ intent: 'delete-part', partId: String(elsewhere.id) }),
            actor,
          )
          const foreignKept = (await tx.templatePart.count({ where: { id: elsewhere.id } })) === 1

          // A second service, then the two in the other order.
          await handleScheduleTemplateItem(
            db,
            duties.id,
            form({ intent: 'upsert-service-role', roleName: 'Son', roleKey: '' }),
            actor,
          )
          const serviceIds = (
            await tx.templateServicePart.findMany({
              where: { scheduleTemplateId: duties.id },
              orderBy: { order: 'asc' },
            })
          ).map(row => row.id)
          await handleScheduleTemplateItem(
            db,
            duties.id,
            form({ intent: 'reorder-services', orderedIds: JSON.stringify([...serviceIds].reverse()) }),
            actor,
          )
          const services = await tx.templateServicePart.findMany({
            where: { scheduleTemplateId: duties.id },
            orderBy: { order: 'asc' },
          })
          const serviceMirrors = await tx.templateItem.findMany({
            where: { congregationId, legacyServiceId: { not: null } },
            select: { legacyServiceId: true },
          })

          // A kind coming to use it hides none of its parts, and a part added then goes after them, under the kind.
          const kind = await tx.eventTemplate.create({
            data: { name: 'Visite du responsable', key: stamp, congregationId },
          })
          await tx.eventKindScheduleTemplate.create({
            data: { eventKindId: kind.id, scheduleTemplateId: programme.id, congregationId },
          })
          await part({ partName: 'Conclusion', partSection: '', partOrder: '' })
          const adopted = (await names()).map(each => `${each.name}:${each.templateId === kind.id ? 'kind' : 'own'}`)

          let deleteRefused = false
          try {
            await tx.$executeRawUnsafe('SAVEPOINT before_delete')
            await tx.scheduleTemplate.delete({ where: { id: programme.id } })
          } catch {
            deleteRefused = true
            await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT before_delete')
          }

          read = {
            written,
            parts: rows.map(row => ({
              name: row.name,
              section: row.section,
              templateId: row.templateId,
              mirrored: mirrors.some(mirror => mirror.legacyPartId === row.id),
              rooms: row.rooms.map(each => each.room.key ?? each.room.name ?? ''),
            })),
            listed,
            afterRename,
            afterReorder,
            afterDelete,
            placed,
            foreign: foreign?.kind,
            foreignKept,
            adopted,
            services: services.map(row => ({
              name: row.name,
              templateId: row.templateId,
              mirrored: serviceMirrors.some(mirror => mirror.legacyServiceId === row.id),
            })),
            deleteRefused,
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (read == null) throw new Error('nothing read')
    expect(read.written).toEqual(['saved', 'saved', 'saved'])
    expect(read.parts).toEqual([
      { name: 'Discours', section: 'Matin', templateId: null, mirrored: true, rooms: ['main'] },
      { name: 'Prière', section: 'Matin', templateId: null, mirrored: true, rooms: ['main'] },
    ])
    expect(read.listed).toEqual(['Discours', 'Prière'])
    expect(read.afterRename).toEqual(['Après-midi', 'Après-midi'])
    expect(read.afterReorder).toEqual(['Prière', 'Discours'])
    expect(read.afterDelete).toEqual(['Prière'])
    expect(read.placed).toEqual(['Soir:Cantique', 'Soir:Prière finale'])
    expect([read.foreign, read.foreignKept]).toEqual(['refused', true])
    expect(read.adopted).toEqual(['Cantique:own', 'Prière finale:own', 'Conclusion:kind'])
    expect(read.services).toEqual([
      { name: 'Son', templateId: null, mirrored: true },
      { name: 'Zoom', templateId: null, mirrored: true },
    ])
    expect(read.deleteRefused).toBe(true)
  })
})
