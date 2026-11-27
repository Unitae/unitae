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
const { createMeetingProgramme } = await import('./create-meeting-programme.server')

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

  // A meeting created ahead may already hold an empty services schedule of no template of its type (added by hand
  // while the type used none): its programme fills that one, as before, rather than making a second beside it. And a
  // published one gives every schedule it gets its status.
  it('fills the empty services schedule a meeting holds, and publishes what a published meeting gets', async () => {
    let read: Record<string, unknown> | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `duties-ahead-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
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
          const accueil = await tx.scheduleTemplate.create({ data: { name: 'Accueil', kind: 'duty', congregationId } })
          const visio = await tx.scheduleTemplate.create({ data: { name: 'Visio', kind: 'duty', congregationId } })
          // Used by the type, with nothing in it yet.
          const empty = await tx.scheduleTemplate.create({ data: { name: 'Vide', kind: 'duty', congregationId } })
          await tx.eventKindScheduleTemplate.createMany({
            data: [
              { eventKindId: kind.id, scheduleTemplateId: programme.id, order: 0, congregationId },
              { eventKindId: kind.id, scheduleTemplateId: accueil.id, order: 1, congregationId },
              { eventKindId: kind.id, scheduleTemplateId: visio.id, order: 2, congregationId },
              { eventKindId: kind.id, scheduleTemplateId: empty.id, order: 3, congregationId },
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
          await tx.templateServicePart.create({
            data: { name: 'Porte', key: `porte-${stamp}`, order: 0, scheduleTemplateId: accueil.id, congregationId },
          })
          await tx.templateServicePart.create({
            data: { name: 'Zoom', key: `zoom-${stamp}`, order: 0, scheduleTemplateId: visio.id, congregationId },
          })
          const meeting = (day: string, status: string) =>
            tx.event.create({
              data: {
                name: 'Visite',
                startDate: new Date(`${day}T17:00:00Z`),
                endDate: new Date(`${day}T19:00:00Z`),
                status,
                templateId: kind.id,
                congregationId,
              },
            })
          const held = await meeting('2099-04-01', 'draft')
          // An empty schedule from the type's empty template, made first: its template is the type's, never adopted.
          const fromEmpty = await tx.schedule.create({
            data: {
              eventId: held.id,
              kind: 'duty',
              name: 'Vide',
              order: 1,
              status: 'draft',
              scheduleTemplateId: empty.id,
              congregationId,
            },
          })
          const byHand = await tx.schedule.create({
            data: { eventId: held.id, kind: 'duty', name: 'ZZ Accueil', order: 1, status: 'draft', congregationId },
          })
          const published = await meeting('2099-04-08', 'released')
          const ctx = { congregationId, timezone: 'Europe/Paris', actorId }
          await createMeetingProgramme(db, held.id, ctx)
          await createMeetingProgramme(db, published.id, ctx)
          const schedules = (eventId: number) =>
            tx.schedule.findMany({
              where: { eventId },
              orderBy: [{ order: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                kind: true,
                status: true,
                scheduleTemplateId: true,
                _count: { select: { items: true } },
              },
            })
          const named = (each: { id: number; scheduleTemplateId: number | null }) =>
            each.id === byHand.id
              ? 'by hand'
              : each.id === fromEmpty.id
                ? 'empty'
                : each.scheduleTemplateId === visio.id
                  ? 'visio'
                  : 'other'
          read = {
            held: (await schedules(held.id)).map(each => ({
              kind: each.kind,
              schedule: named(each),
              items: each._count.items,
            })),
            published: (await schedules(published.id)).map(each => `${each.kind}:${each.status}`),
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    expect(read).toEqual({
      // The first template's services fill the hand-made schedule (not the one from the type's empty template); the
      // second template gets a schedule of its own.
      held: [
        { kind: 'programme', schedule: 'other', items: 1 },
        { kind: 'duty', schedule: 'empty', items: 0 },
        { kind: 'duty', schedule: 'by hand', items: 1 },
        { kind: 'duty', schedule: 'visio', items: 1 },
      ],
      published: ['programme:published', 'duty:published', 'duty:published'],
    })
  })
})
