import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { settleFixtureSchedules } from '~/tests/helpers/settle-fixture-schedules'

// A publisher's record names their assignments: the coming ones, and the last one done. Several in one meeting are
// read in the programme's order — parts, then services — not in whatever order the table returns them, so the record
// reads the same every time.

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

const { findLastAssignmentsForMembers, findUpcomingAssignmentsForMember } = await import('./member-engagement.queries')

const ts = Date.now()
const ids = { cong: 0, member: 0 }
const NOW = new Date('2027-03-03T09:00:00Z')

beforeAll(async () => {
  ids.cong = (
    await testDb.congregation.create({ data: { name: `Engagement ${ts}`, slug: `engagement-${ts}`, active: true } })
  ).id
  await withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    ids.member = (await tx.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })).id
    // One meeting done, one to come; each with two parts and a service created in an order the programme does not
    // follow.
    for (const day of ['2027-02-23T18:00:00Z', '2027-03-09T18:00:00Z']) {
      const startDate = new Date(day)
      const event = await tx.event.create({
        data: { name: 'Réunion', startDate, endDate: startDate, status: 'released', congregationId },
      })
      const held = { eventId: event.id, assigneeId: ids.member, congregationId }
      await tx.eventServicePart.create({ data: { name: 'Sono', order: 0, ...held } })
      await tx.eventPart.create({ data: { name: 'Cantique de conclusion', order: 20, ...held } })
      await tx.eventPart.create({ data: { name: 'Cantique et prière', order: 0, ...held } })
    }
    await settleFixtureSchedules(tx as never, congregationId)
  })
})

afterAll(async () => {
  if (ids.cong) {
    await withScope(ids.cong, async tx => {
      await tx.event.deleteMany({})
      await tx.member.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: ids.cong } })
  }
  await testDb.$disconnect()
})

describe('a publisher’s assignments within one meeting', () => {
  it('lists the coming ones in the programme’s order: parts, then services', async () => {
    const upcoming = await withScope(ids.cong, tx =>
      findUpcomingAssignmentsForMember(tx, ids.member as never, ids.cong as never, NOW),
    )

    expect(upcoming.map(assignment => assignment.partName)).toEqual([
      'Cantique et prière',
      'Cantique de conclusion',
      'Sono',
    ])
  })

  it('names the first of the meeting’s parts as the last assignment done', async () => {
    const last = await withScope(ids.cong, tx =>
      findLastAssignmentsForMembers(tx, [ids.member as never], ids.cong as never, NOW),
    )

    expect(last.get(ids.member as never)?.partName).toBe('Cantique et prière')
  })
})
