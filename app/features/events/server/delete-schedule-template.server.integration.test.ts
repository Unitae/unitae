import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// « Supprimer le modèle » (design round A, « TourA-Modeles-Dialogues »): the template goes with its parts or services,
// the kinds' as well as its own, so the kinds using it give their new meetings none of it; the schedules made from it
// keep their name and content, with no template (no responsible). In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { deleteScheduleTemplate } = await import('./delete-schedule-template.server')

class Rollback extends Error {}

afterAll(async () => {
  await flushPendingAuditWrites()
  await testDb.$disconnect()
})

describe('deleteScheduleTemplate', () => {
  it('deletes a template with every item of it, keeps the schedules made from it, and nothing else', async () => {
    let read: Record<string, unknown> | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `delete-st-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const actorId = (
            await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
          ).id
          await seedDefaultTemplates(db, congregationId, 'fr')
          const kind = await tx.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })
          await syncTemplateScheduleTemplates(db, kind.id, congregationId)
          const ofKind = async (scheduleKind: string) =>
            (
              await tx.eventKindScheduleTemplate.findFirstOrThrow({
                where: { eventKindId: kind.id, scheduleTemplate: { kind: scheduleKind } },
                select: { scheduleTemplate: { select: { id: true, name: true } } },
              })
            ).scheduleTemplate
          const programme = await ofKind('programme')
          const duties = await ofKind('duty')
          const event = await tx.event.create({
            data: {
              name: 'Réunion',
              startDate: new Date('2099-03-04T18:00:00Z'),
              endDate: new Date('2099-03-04T20:00:00Z'),
              templateId: kind.id,
              congregationId,
            },
          })
          const schedule = await tx.schedule.create({
            data: {
              eventId: event.id,
              scheduleTemplateId: programme.id,
              name: 'Vie et ministère',
              kind: 'programme',
              congregationId,
            },
          })
          // A template no kind uses, its part its own.
          const own = await tx.scheduleTemplate.create({ data: { name: 'Visite', kind: 'programme', congregationId } })
          await tx.templatePart.create({
            data: { name: 'Discours', section: '', track: '', order: 0, scheduleTemplateId: own.id, congregationId },
          })

          const deleted = await deleteScheduleTemplate(db, programme.id, congregationId, actorId)
          const standalone = await deleteScheduleTemplate(db, own.id, congregationId, actorId)
          const missing = await deleteScheduleTemplate(db, own.id, congregationId, actorId)
          await flushPendingAuditWrites()
          read = {
            deleted,
            standalone,
            missing,
            programmeLeft: await tx.scheduleTemplate.count({ where: { id: { in: [programme.id, own.id] } } }),
            kindParts: await tx.templatePart.count({ where: { templateId: kind.id } }),
            ownParts: await tx.templatePart.count({ where: { scheduleTemplateId: own.id } }),
            kindServices: await tx.templateServicePart.count({
              where: { templateId: kind.id, scheduleTemplateId: duties.id },
            }),
            links: await tx.eventKindScheduleTemplate.count({ where: { eventKindId: kind.id } }),
            schedule: await tx.schedule.findFirst({
              where: { id: schedule.id },
              select: { name: true, scheduleTemplateId: true },
            }),
            audits: (
              await tx.auditLog.findMany({
                where: { congregationId, action: 'schedule_template.deleted' },
                orderBy: { id: 'asc' },
                select: { entityId: true, metadata: true },
              })
            ).map(row => ({ entityId: row.entityId, metadata: JSON.parse(String(row.metadata)) })),
            ids: { programme: programme.id, own: own.id, kindName: kind.name, programmeName: programme.name },
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (read == null) throw new Error('nothing read')
    const ids = read.ids as { programme: number; own: number; kindName: string; programmeName: string | null }
    expect(read.deleted).toEqual({ name: ids.programmeName, kinds: [ids.kindName], schedules: 1 })
    expect(read.standalone).toEqual({ name: 'Visite', kinds: [], schedules: 0 })
    expect(read.missing).toBeNull()
    expect(read.programmeLeft).toBe(0)
    // The kind's parts went with its programme template; its services, in its duties template, stay.
    expect(read.kindParts).toBe(0)
    expect(read.ownParts).toBe(0)
    expect(read.kindServices).toBeGreaterThan(0)
    expect(read.links).toBe(1)
    expect(read.schedule).toEqual({ name: 'Vie et ministère', scheduleTemplateId: null })
    expect(read.audits).toEqual([
      {
        entityId: ids.programme,
        metadata: { name: ids.programmeName, kinds: [ids.kindName], schedules: 1, items: expect.any(Number) },
      },
      { entityId: ids.own, metadata: { name: 'Visite', kinds: [], schedules: 0, items: 1 } },
    ])
  })
})
