import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// A type using several duties templates (user, 2026-11-27): a new meeting gets one schedule per template, each with its
// template's services; the type's own services not placed yet join the first. The counts and the creation form say so
// before anything is created. In a congregation of its own, rolled back.

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
const { getProgrammeCreationData } = await import('./programme-creation.queries')

class Rollback extends Error {}

afterAll(async () => {
  await flushPendingAuditWrites()
  await testDb.$disconnect()
})

describe('a type using several duties templates', () => {
  it('gives a new meeting one schedule per duties template, and counts and offers them all', async () => {
    let read: Record<string, unknown> | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `duties-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const actorId = (
            await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
          ).id
          const kind = await tx.eventTemplate.create({
            data: { name: 'Visite', key: stamp, weekDay: 3, startTime: '19:00', endTime: '21:00', congregationId },
          })
          const template = (name: string, sort: 'programme' | 'duty') =>
            tx.scheduleTemplate.create({ data: { name, kind: sort, congregationId } })
          const programme = await template('Visite', 'programme')
          const accueil = await template('Accueil', 'duty')
          const visio = await template('Visioconférence', 'duty')
          await tx.eventKindScheduleTemplate.createMany({
            data: [
              { eventKindId: kind.id, scheduleTemplateId: programme.id, order: 0, congregationId },
              { eventKindId: kind.id, scheduleTemplateId: accueil.id, order: 1, congregationId },
              { eventKindId: kind.id, scheduleTemplateId: visio.id, order: 2, congregationId },
            ],
          })
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
          const service = (name: string, order: number, data: { scheduleTemplateId?: number; templateId?: number }) =>
            tx.templateServicePart.create({ data: { name, key: `${name}-${stamp}`, order, ...data, congregationId } })
          await service('Porte', 0, { scheduleTemplateId: accueil.id })
          await service('Zoom', 0, { scheduleTemplateId: visio.id })
          await service('Caméra', 5, { scheduleTemplateId: visio.id })
          // The type's own, not placed in a template yet.
          await service('Parking', 10, { templateId: kind.id })

          const counted = programmeTemplate(
            await tx.eventTemplate.findFirstOrThrow({
              where: { id: kind.id },
              select: { key: true, ...TEMPLATE_PROGRAMME_COUNT },
            }),
          )
          const form = await getProgrammeCreationData(db, {
            congregationId,
            timezone: 'Europe/Paris',
            today: '2099-03-01',
            templateIds: [kind.id],
          })
          const offered = form.templates
            .find(each => each.id === kind.id)
            ?.schedules.map(each => `${each.kind}:${each.name ?? '-'}:${each.items}`)
          const created = await createProgrammeOnDay(
            db,
            { templateId: kind.id, day: '2099-03-04' },
            { congregationId, timezone: 'Europe/Paris', actorId },
          )
          const schedules = await tx.schedule.findMany({
            where: { eventId: created.id },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
            select: {
              kind: true,
              name: true,
              scheduleTemplateId: true,
              items: { orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { name: true } },
            },
          })
          read = {
            counted: { parts: counted?.parts, services: counted?.services },
            offered,
            schedules: schedules.map(each => ({
              kind: each.kind,
              name: each.name,
              template: [programme.id, accueil.id, visio.id].indexOf(each.scheduleTemplateId ?? -1),
              items: each.items.map(item => item.name),
            })),
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    expect(read).toEqual({
      counted: { parts: 1, services: 4 },
      offered: ['programme:Visite:1', 'duty:Accueil:2', 'duty:Visioconférence:2'],
      schedules: [
        { kind: 'programme', name: 'Visite', template: 0, items: ['Discours'] },
        { kind: 'duty', name: 'Accueil', template: 1, items: ['Porte', 'Parking'] },
        { kind: 'duty', name: 'Visioconférence', template: 2, items: ['Zoom', 'Caméra'] },
      ],
    })
  })
})
