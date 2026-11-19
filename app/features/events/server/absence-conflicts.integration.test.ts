import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// The conflict readers read absences from their own table, by the person's record: whether someone is away when they
// are assigned, the conflict flags on their assignments, and what the list of people to pick from says. An absence
// row is enough; the day-off event written alongside it no longer counts on its own.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

type Tx = Parameters<Parameters<typeof testDb.$transaction>[0]>[0]

function withScope<T>(congregationId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return testDb.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
    return fn(tx)
  })
}

const { checkDayOffConflict } = await import('./event-part-assignments.server')
const { refreshConflictFlags } = await import('./refresh-conflict-flags.server')
const { listSlotCandidateFacts } = await import('./slot-candidate-facts.server')

const ts = Date.now()
const ids = { cong: 0, paul: 0, marie: 0, meeting: 0, paulPart: 0, mariePart: 0, service: 0 }
const MEETING_START = new Date('2027-06-08T17:00:00Z')
const MEETING_END = new Date('2027-06-08T19:00:00Z')
const AWAY_START = new Date('2027-06-07T00:00:00Z')
const AWAY_END = new Date('2027-06-10T23:59:00Z')

beforeAll(async () => {
  ids.cong = (
    await testDb.congregation.create({
      data: { name: `Conflicts ${ts}`, slug: `absence-conflicts-${ts}`, active: true },
    })
  ).id
  await withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    const dayOff = await tx.eventTemplate.create({ data: { name: 'Absence', key: 'day-off', congregationId } })
    const person = async (firstname: string) => {
      const member = await tx.member.create({ data: { firstname, lastname: 'TEST', congregationId } })
      const account = await tx.userAccount.create({
        data: { email: `${firstname}-${ts}@test.com`, password: 'x', memberId: member.id, congregationId },
      })
      return { member: member.id, account: account.id }
    }
    const paul = await person('paul')
    const marie = await person('marie')
    ids.paul = paul.member
    ids.marie = marie.member

    // Paul: an absence row only. Marie: a day-off event only, as the previous version wrote during the rollout.
    await tx.absence.create({
      data: {
        startDate: AWAY_START,
        endDate: AWAY_END,
        memberId: paul.member,
        accountId: paul.account,
        congregationId,
      },
    })
    await tx.event.create({
      data: {
        name: 'Absence',
        startDate: AWAY_START,
        endDate: AWAY_END,
        status: 'released',
        templateId: dayOff.id,
        createdById: marie.account,
        congregationId,
      },
    })

    const meeting = await tx.event.create({
      data: { name: 'Réunion', startDate: MEETING_START, endDate: MEETING_END, status: 'released', congregationId },
    })
    ids.meeting = meeting.id
    ids.paulPart = (
      await tx.eventPart.create({
        data: { name: 'Lecture', eventId: meeting.id, assigneeId: paul.member, congregationId },
      })
    ).id
    ids.mariePart = (
      await tx.eventPart.create({
        data: { name: 'Prière', eventId: meeting.id, assigneeId: marie.member, congregationId },
      })
    ).id
    ids.service = (await tx.eventServicePart.create({ data: { name: 'Sono', eventId: meeting.id, congregationId } })).id
  })
})

afterAll(async () => {
  if (ids.cong) {
    await withScope(ids.cong, async tx => {
      await tx.absence.deleteMany({})
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.member.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: ids.cong } })
  }
  await testDb.$disconnect()
})

describe('the conflict readers and the absences table', () => {
  it('says someone is away from their absence row', async () => {
    const [paul, marie] = await withScope(ids.cong, tx =>
      Promise.all([
        checkDayOffConflict(tx, ids.paul, MEETING_START, MEETING_END, ids.cong),
        checkDayOffConflict(tx, ids.marie, MEETING_START, MEETING_END, ids.cong),
      ]),
    )

    expect({ paul, marie }).toEqual({ paul: true, marie: false })
  })

  it('flags the assignments an absence row covers', async () => {
    await withScope(ids.cong, async tx => {
      await refreshConflictFlags(tx, ids.paul, AWAY_START, AWAY_END, ids.cong)
      await refreshConflictFlags(tx, ids.marie, AWAY_START, AWAY_END, ids.cong)
    })
    const flags = await withScope(ids.cong, tx =>
      tx.eventPart.findMany({ where: { eventId: ids.meeting }, select: { id: true, hasConflict: true } }),
    )

    expect(Object.fromEntries(flags.map(part => [part.id, part.hasConflict]))).toEqual({
      [ids.paulPart]: true,
      [ids.mariePart]: false,
    })
  })

  it('names the absence in the facts about the people to pick from', async () => {
    const facts = await withScope(ids.cong, tx =>
      listSlotCandidateFacts(tx, {
        event: { id: ids.meeting, templateId: null, startDate: MEETING_START, endDate: MEETING_END },
        congregationId: ids.cong,
        target: { kind: 'service', assignmentId: ids.service, serviceName: 'Sono' },
      }),
    )

    expect(facts.absences).toEqual({
      [ids.paul]: { startDate: AWAY_START.toISOString(), endDate: AWAY_END.toISOString() },
    })
  })
})
