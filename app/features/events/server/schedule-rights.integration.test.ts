import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

// The rights per schedule (plan §10, D3, D7, D28, D31, D47), one `describe` per row of the plan's table. A schedule's
// responsible is the role its template names (ScheduleTemplate.responsibleRoleId, synced from the responsibles Réglages
// names); the congregation-wide rights reach
// every schedule. Against the database, in a congregation of its own with the default templates, rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { seedDefaultTemplates } = await import('./seed-templates.server')
const { createProgrammeOnDay } = await import('./programme-creation.server')
const { canFillSchedule } = await import('./events-auth.server')
const { syncTemplateScheduleTemplates } = await import('./schedule-templates.server')

class Rollback extends Error {}

type Can = (permission: Permission) => boolean
const nothing: Can = () => false
const only =
  (...held: Permission[]): Can =>
  permission =>
    held.includes(permission)

interface Fixture {
  db: TransactionClient
  congregationId: number
  /** Accounts: one per responsible role, and one holding no role. */
  programmeLead: number
  dutyLead: number
  nobody: number
  /** The midweek kind, its programme and duty schedule templates carrying the two roles. */
  midweekId: number
  /** A midweek meeting with its programme and duties, made as the app makes it. */
  meeting: { id: number; templateId: number | null }
}

async function inCongregation(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `rights-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const db = tx as unknown as TransactionClient
        const account = async (name: string, roleId?: number) => {
          const { id } = await tx.userAccount.create({
            data: { email: `${name}-${stamp}@test.com`, password: 'x', congregationId },
          })
          if (roleId != null) await tx.userRoleAssignment.create({ data: { userId: id, roleId, congregationId } })
          return id
        }
        const actorId = await account('admin')
        await seedDefaultTemplates(db, congregationId, 'fr')
        const programmeRole = await tx.role.create({ data: { key: `p-${stamp}`, name: 'p', congregationId } })
        const dutyRole = await tx.role.create({ data: { key: `d-${stamp}`, name: 'd', congregationId } })
        const midweekId = (await tx.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })).id
        // As Réglages names them: a role per scope on the template, which the sync gives its schedule templates (D31:
        // the services one to the duties alone).
        for (const [roleId, scope] of [
          [programmeRole.id, 'programme'],
          [dutyRole.id, 'service'],
        ] as const) {
          await tx.templateResponsible.create({ data: { templateId: midweekId, roleId, scope, congregationId } })
        }
        await syncTemplateScheduleTemplates(db, midweekId, congregationId)
        const meeting = await createProgrammeOnDay(
          db,
          { templateId: midweekId, day: '2027-07-01' },
          { congregationId, timezone: 'Europe/Paris', actorId },
        )
        await fn({
          db,
          congregationId,
          programmeLead: await account('programme', programmeRole.id),
          dutyLead: await account('duty', dutyRole.id),
          nobody: await account('nobody'),
          midweekId,
          meeting: { id: meeting.id, templateId: midweekId },
        })
        throw new Rollback()
      },
      { timeout: 20_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('Fill a schedule (items, assignees): « Attribuer », « Gérer », or the responsible of its template', () => {
  it('lets « Attribuer » and « Gérer » fill both schedules, holding no role', async () => {
    await inCongregation(async ({ db, congregationId, nobody, meeting }) => {
      for (const can of [only(Permission.CanAssignProgramParts), only(Permission.CanManagePrograms)]) {
        expect(await canFillSchedule(db, can, nobody, meeting, 'part', congregationId)).toBe(true)
        expect(await canFillSchedule(db, can, nobody, meeting, 'service', congregationId)).toBe(true)
      }
    })
  })

  it('lets each responsible fill the schedule of their template only (D7, D31)', async () => {
    await inCongregation(async ({ db, congregationId, programmeLead, dutyLead, meeting }) => {
      expect(await canFillSchedule(db, nothing, programmeLead, meeting, 'part', congregationId)).toBe(true)
      expect(await canFillSchedule(db, nothing, programmeLead, meeting, 'service', congregationId)).toBe(false)
      expect(await canFillSchedule(db, nothing, dutyLead, meeting, 'service', congregationId)).toBe(true)
      expect(await canFillSchedule(db, nothing, dutyLead, meeting, 'part', congregationId)).toBe(false)
    })
  })

  it('refuses whoever holds neither a right nor the role, and « Publier » alone', async () => {
    await inCongregation(async ({ db, congregationId, nobody, meeting }) => {
      for (const can of [nothing, only(Permission.CanPublishPrograms)]) {
        expect(await canFillSchedule(db, can, nobody, meeting, 'part', congregationId)).toBe(false)
        expect(await canFillSchedule(db, can, nobody, meeting, 'service', congregationId)).toBe(false)
      }
    })
  })

  it('reaches a schedule without a template through the congregation-wide rights only (D47)', async () => {
    await inCongregation(async ({ db, congregationId, programmeLead, nobody, meeting }) => {
      await db.schedule.updateMany({
        where: { eventId: meeting.id, kind: 'programme' },
        data: { scheduleTemplateId: null },
      })
      expect(await canFillSchedule(db, nothing, programmeLead, meeting, 'part', congregationId)).toBe(false)
      expect(
        await canFillSchedule(db, only(Permission.CanAssignProgramParts), nobody, meeting, 'part', congregationId),
      ).toBe(true)
    })
  })
})

describe('Add a schedule: « Gérer », or the responsible of that schedule template', () => {
  it('lets a responsible start their schedule on an event of a kind suggesting its template', async () => {
    await inCongregation(async ({ db, congregationId, programmeLead, dutyLead, midweekId }) => {
      const bare = await db.event.create({
        data: {
          name: 'Réunion',
          startDate: new Date('2027-07-08T17:00:00Z'),
          endDate: new Date('2027-07-08T19:00:00Z'),
          templateId: midweekId,
          congregationId,
        },
      })
      const event = { id: bare.id, templateId: midweekId }
      expect(await canFillSchedule(db, nothing, programmeLead, event, 'part', congregationId)).toBe(true)
      expect(await canFillSchedule(db, nothing, programmeLead, event, 'service', congregationId)).toBe(false)
      expect(await canFillSchedule(db, nothing, dutyLead, event, 'service', congregationId)).toBe(true)
    })
  })

  it('leaves an event with no kind to the congregation-wide rights', async () => {
    await inCongregation(async ({ db, congregationId, programmeLead }) => {
      const bare = await db.event.create({
        data: {
          name: 'Import',
          startDate: new Date('2027-07-15T17:00:00Z'),
          endDate: new Date('2027-07-15T19:00:00Z'),
          congregationId,
        },
      })
      const event = { id: bare.id, templateId: null }
      expect(await canFillSchedule(db, nothing, programmeLead, event, 'part', congregationId)).toBe(false)
      expect(
        await canFillSchedule(db, only(Permission.CanManagePrograms), programmeLead, event, 'part', congregationId),
      ).toBe(true)
    })
  })
})
