import type { TransactionClient } from '~/shared/infra/db.server'
import { settleFixtureSchedules } from './settle-fixture-schedules'

// One upcoming released meeting whose two schedules disagree, the shape per-schedule publishing makes (spec D46): its
// programme holds a member's part and its duties the same member's duty, both flagged in an absence. A test sets each
// schedule's status, then asks a reader what members see.

export interface DivergingMeeting {
  congregationId: number
  memberId: number
  templateKey: string
  eventId: number
  partName: string
  dutyName: string
  /** Sets the meeting's programme and duty schedules, the event staying released. */
  publish: (statuses: { programme: 'draft' | 'published'; duty: 'draft' | 'published' }) => Promise<void>
}

/** Writes the meeting in a congregation of its own, inside the caller's (rolled-back) transaction. */
export async function divergingMeeting(db: TransactionClient, stamp: string): Promise<DivergingMeeting> {
  const congregationId = (await db.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
  await db.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
  const member = await db.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })
  const templateKey = `midweek-${stamp}`
  const template = await db.eventTemplate.create({
    data: { name: 'Réunion de semaine', key: templateKey, congregationId },
  })
  const startDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  const event = await db.event.create({
    data: {
      name: 'Réunion de semaine',
      startDate,
      endDate: new Date(startDate.getTime() + 105 * 60 * 1000),
      status: 'released',
      templateId: template.id,
      congregationId,
    },
  })
  const partName = 'Lecture de la Bible'
  const dutyName = 'Sonorisation'
  await db.eventPart.create({
    data: { name: partName, eventId: event.id, assigneeId: member.id, hasConflict: true, congregationId },
  })
  await db.eventServicePart.create({
    data: { name: dutyName, eventId: event.id, assigneeId: member.id, hasConflict: true, congregationId },
  })
  await settleFixtureSchedules(db, congregationId)

  return {
    congregationId,
    memberId: member.id,
    templateKey,
    eventId: event.id,
    partName,
    dutyName,
    publish: async ({ programme, duty }) => {
      await db.schedule.updateMany({ where: { eventId: event.id, kind: 'programme' }, data: { status: programme } })
      await db.schedule.updateMany({ where: { eventId: event.id, kind: 'duty' }, data: { status: duty } })
    },
  }
}
