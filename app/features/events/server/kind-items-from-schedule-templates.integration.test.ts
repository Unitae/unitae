import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// A meeting type's items are those of the schedule templates it uses (6b-0): a new meeting copies the parts and services
// of the templates linked to its type, the template's own (made in « Modèles de planning », under no kind) as well as
// the type's rows, and « does this type have a programme to give » counts them alike. In a congregation of its own,
// rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { createProgrammeOnDay } = await import('./programme-creation.server')
const { TEMPLATE_PROGRAMME_COUNT } = await import('./give-programme.server')
const { programmeTemplate } = await import('~/features/events/model/empty-meetings')

class Rollback extends Error {}

afterAll(async () => {
  await flushPendingAuditWrites()
  await testDb.$disconnect()
})

describe('a meeting type’s items, from the schedule templates it uses', () => {
  it('gives a new meeting the own items of a template no kind owned, and counts them as a programme', async () => {
    let read: Record<string, unknown> | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `kind-items-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const actorId = (
            await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
          ).id
          const kind = await tx.eventTemplate.create({
            data: { name: 'Visite', key: stamp, weekDay: 3, startTime: '19:00', endTime: '21:00', congregationId },
          })
          const programme = await tx.scheduleTemplate.create({
            data: { name: 'Visite', kind: 'programme', congregationId },
          })
          const duties = await tx.scheduleTemplate.create({ data: { name: 'Accueil', kind: 'duty', congregationId } })
          await tx.templatePart.create({
            data: {
              name: 'Discours',
              section: '',
              track: '',
              order: 0,
              scheduleTemplateId: programme.id,
              congregationId,
            },
          })
          await tx.templateServicePart.create({
            data: { name: 'Porte', key: 'porte', scheduleTemplateId: duties.id, congregationId },
          })
          await tx.eventKindScheduleTemplate.createMany({
            data: [
              { eventKindId: kind.id, scheduleTemplateId: programme.id, order: 0, congregationId },
              { eventKindId: kind.id, scheduleTemplateId: duties.id, order: 1, congregationId },
            ],
          })

          const counted = programmeTemplate(
            await tx.eventTemplate.findFirstOrThrow({
              where: { id: kind.id },
              select: { key: true, ...TEMPLATE_PROGRAMME_COUNT },
            }),
          )
          const created = await createProgrammeOnDay(
            db,
            { templateId: kind.id, day: '2099-03-04' },
            { congregationId, timezone: 'Europe/Paris', actorId },
          )
          const items = await tx.item.findMany({
            where: { eventId: created.id },
            select: { name: true, schedule: { select: { kind: true, scheduleTemplateId: true } } },
            orderBy: { id: 'asc' },
          })
          read = {
            counted,
            items: items.map(item => `${item.schedule?.kind}:${item.name}`),
            fromTemplates: items.map(item => item.schedule?.scheduleTemplateId),
            ids: [programme.id, duties.id],
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (read == null) throw new Error('nothing read')
    expect(read.counted).toMatchObject({ parts: 1, services: 1 })
    expect(read.items).toEqual(['programme:Discours', 'duty:Porte'])
    expect(read.fromTemplates).toEqual(read.ids)
  })

  // One rule for what a meeting copies and what the counts say, or a meeting could wait for a programme it never gets.
  it('counts what a new meeting copies: the first template of each sort, and the kind’s rows not placed', async () => {
    let read: Record<string, unknown> | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `kind-rule-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const actorId = (
            await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
          ).id
          const kind = (name: string, weekDay: number) =>
            tx.eventTemplate.create({
              data: { name, key: `${stamp}-${weekDay}`, weekDay, startTime: '19:00', endTime: '21:00', congregationId },
            })
          const part = (name: string, data: { scheduleTemplateId?: number; templateId?: number }) =>
            tx.templatePart.create({ data: { name, section: '', track: '', order: 0, ...data, congregationId } })
          // Two programme templates: only the first is the kind's programme.
          const two = await kind('Deux', 3)
          const first = await tx.scheduleTemplate.create({
            data: { name: 'Premier', kind: 'programme', congregationId },
          })
          const second = await tx.scheduleTemplate.create({
            data: { name: 'Second', kind: 'programme', congregationId },
          })
          await part('A', { scheduleTemplateId: first.id })
          await part('B', { scheduleTemplateId: second.id })
          await part('C', { scheduleTemplateId: second.id })
          await tx.eventKindScheduleTemplate.createMany({
            data: [
              { eventKindId: two.id, scheduleTemplateId: first.id, order: 0, congregationId },
              { eventKindId: two.id, scheduleTemplateId: second.id, order: 1, congregationId },
            ],
          })
          // No link, its rows not placed yet.
          const loose = await kind('Libre', 4)
          await part('D', { templateId: loose.id })
          await part('E', { templateId: loose.id })

          const counted = async (id: number) =>
            programmeTemplate(
              await tx.eventTemplate.findFirstOrThrow({
                where: { id },
                select: { key: true, ...TEMPLATE_PROGRAMME_COUNT },
              }),
            )?.parts
          const copied = async (id: number, day: string) => {
            const created = await createProgrammeOnDay(
              db,
              { templateId: id, day },
              { congregationId, timezone: 'Europe/Paris', actorId },
            )
            return (await tx.item.findMany({ where: { eventId: created.id }, select: { name: true } })).map(
              each => each.name,
            )
          }
          read = {
            two: { counted: await counted(two.id), copied: await copied(two.id, '2099-03-04') },
            loose: { counted: await counted(loose.id), copied: await copied(loose.id, '2099-03-05') },
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    expect(read).toEqual({
      two: { counted: 1, copied: ['A'] },
      loose: { counted: 2, copied: ['D', 'E'] },
    })
  })
})
