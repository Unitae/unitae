import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

// The dashboard's open parts and conflicts reach a schedule's responsible through the role its template names (plan
// §10, 5a-3), like the rights do: on a template naming both responsibles, the duties are the services responsible's
// alone (D31). Against the database, in a congregation of its own, rolled back.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { createProgrammeOnDay } = await import('~/features/events/server/programme-creation.server')
const { getOpenParts } = await import('./get-open-parts.server')
const { getResponsibleConflicts } = await import('./get-responsible-conflicts.server')

class Rollback extends Error {}

interface Fixture {
  db: TransactionClient
  congregationId: number
  programmeLead: { accountId: number; roleId: number }
  dutyLead: { accountId: number; roleId: number }
  meetingId: number
}

async function withMeeting(fn: (fixture: Fixture) => Promise<void>) {
  try {
    await testDb.$transaction(
      async tx => {
        const stamp = `readers-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
        const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
        const db = tx as unknown as TransactionClient
        const lead = async (name: string) => {
          const role = await tx.role.create({ data: { key: `${name}-${stamp}`, name, congregationId } })
          const account = await tx.userAccount.create({
            data: { email: `${name}-${stamp}@test.com`, password: 'x', congregationId },
          })
          await tx.userRoleAssignment.create({ data: { userId: account.id, roleId: role.id, congregationId } })
          return { accountId: account.id, roleId: role.id }
        }
        const actorId = (await lead('admin')).accountId
        await seedDefaultTemplates(db, congregationId, 'fr')
        const midweekId = (await tx.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })).id
        const programmeLead = await lead('programme')
        const dutyLead = await lead('duty')
        for (const [roleId, scope] of [
          [programmeLead.roleId, 'programme'],
          [dutyLead.roleId, 'service'],
        ] as const) {
          await tx.templateResponsible.create({ data: { templateId: midweekId, roleId, scope, congregationId } })
        }
        await syncTemplateScheduleTemplates(db, midweekId, congregationId)
        const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const meeting = await createProgrammeOnDay(
          db,
          { templateId: midweekId, day: soon },
          { congregationId, timezone: 'Europe/Paris', actorId },
        )
        await fn({ db, congregationId, programmeLead, dutyLead, meetingId: meeting.id })
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

describe('the open parts on the dashboard', () => {
  it('show the meeting to the responsible of its programme, never to the duties’ one', async () => {
    await withMeeting(async ({ db, congregationId, programmeLead, dutyLead, meetingId }) => {
      const forProgramme = await getOpenParts(db, congregationId, { roleIds: [programmeLead.roleId], days: 28 })
      expect(forProgramme.map(slot => slot.eventId)).toEqual([meetingId])
      expect(await getOpenParts(db, congregationId, { roleIds: [dutyLead.roleId], days: 28 })).toEqual([])
      expect((await getOpenParts(db, congregationId, { roleIds: null, days: 28 })).map(slot => slot.eventId)).toEqual([
        meetingId,
      ])
    })
  })
})

describe('the conflicts of a responsible', () => {
  it('count the parts for the programme’s responsible and the duties for theirs', async () => {
    await withMeeting(async ({ db, congregationId, programmeLead, dutyLead, meetingId }) => {
      const absent = await db.member.create({ data: { firstname: 'Luc', lastname: 'ROUX', congregationId } })
      await db.schedule.updateMany({ where: { eventId: meetingId }, data: { status: 'published' } })
      const part = await db.item.findFirstOrThrow({ where: { eventId: meetingId, schedule: { kind: 'programme' } } })
      const duty = await db.item.findFirstOrThrow({ where: { eventId: meetingId, schedule: { kind: 'duty' } } })
      // The part's conflict is the programme's, the duty's the duties'.
      await db.item.update({ where: { id: part.id }, data: { assigneeId: absent.id, hasConflict: true } })
      const conflictsOf = (accountId: number) => getResponsibleConflicts(db, accountId, congregationId, false)
      expect((await conflictsOf(programmeLead.accountId)).count).toBe(1)
      expect((await conflictsOf(dutyLead.accountId)).count).toBe(0)
      await db.item.update({ where: { id: part.id }, data: { hasConflict: false } })
      await db.item.update({ where: { id: duty.id }, data: { assigneeId: absent.id, hasConflict: true } })
      expect((await conflictsOf(programmeLead.accountId)).count).toBe(0)
      expect((await conflictsOf(dutyLead.accountId)).count).toBe(1)
    })
  })
})
