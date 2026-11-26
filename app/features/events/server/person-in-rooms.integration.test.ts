import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { seedMeetingsInRooms } from '~/tests/helpers/rooms-fixture'

// A person's assignments read from the rooms (parallel rooms R3): Jean is the speaker of the first part in « Salle B »,
// on a meeting of copies (an item per room, as the app writes it today) and on the same meeting with one item and a
// row per room (R4's shape). Every reader that finds a person's parts finds his on both, as the speaker, with his
// conflict. In a congregation of its own, rolled back.

const testDb = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
  }),
})

const { seedDefaultTemplates, syncTemplateScheduleTemplates } = await import('~/features/events/index.server')
const { getPersonalAssignments } = await import('./personal-assignments.server')
const { listUserConflictsInRange } = await import('./list-user-conflicts-in-range.server')
const { listUserSameEventAssignments } = await import('./list-user-same-event-assignments.server')
const { findUpcomingAssignmentsForMember } = await import('./member-engagement.queries')
const { getUpcomingAssignments } = await import('~/features/dashboard/server/get-upcoming-assignments.server')
const { getConflictingAssignments } = await import('~/features/dashboard/server/dashboard.server')

class Rollback extends Error {}

afterAll(async () => {
  await testDb.$disconnect()
})

interface Read {
  partName: string
  feed: { copies: string[]; rows: string[] }
  upcoming: { copies: string[]; rows: string[] }
  member: { copies: string[]; rows: string[] }
  conflicts: string[]
  dashboardConflict: string | null
  sameEvent: { copies: string[]; rows: string[] }
  second: { feed: { copies: string[]; rows: string[] }; upcoming: { copies: string[]; rows: string[] } }
}

describe('a person in another room', () => {
  it('is found by every reader of a person’s parts, as the speaker, whatever the shape', async () => {
    let read: Read | undefined
    try {
      await testDb.$transaction(
        async tx => {
          const stamp = `person-rooms-${process.pid}-${globalThis.performance.now().toString().replace('.', '')}`
          const congregationId = (await tx.congregation.create({ data: { name: stamp, slug: stamp, active: true } })).id
          await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congregationId)}'`)
          const db = tx as unknown as TransactionClient
          const actorId = (
            await tx.userAccount.create({ data: { email: `${stamp}@test.com`, password: 'x', congregationId } })
          ).id
          await seedDefaultTemplates(db, congregationId, 'fr')
          const kind = await tx.eventTemplate.findFirstOrThrow({ where: { key: 'midweek-meeting' } })
          await syncTemplateScheduleTemplates(db, kind.id, congregationId)
          const person = async (firstname: string) =>
            (await tx.member.create({ data: { firstname, lastname: 'TEST', congregationId } })).id
          const [paul, jean, luc] = [await person('Paul'), await person('Jean'), await person('Luc')]
          const jeanAccount = (
            await tx.userAccount.create({
              data: { email: `jean-${stamp}@test.com`, password: 'x', memberId: jean, congregationId },
            })
          ).id
          const days: [string, string] = ['2099-03-04', '2099-03-11']
          const seeded = await seedMeetingsInRooms(
            db,
            // Luc is Jean's second speaker, in « Salle B » only.
            { kindId: kind.id, days, speakers: [paul, jean], seconds: [null, luc] },
            { congregationId, actorId },
          )
          const events = [seeded.copies, seeded.rows]
          await tx.event.updateMany({ where: { id: { in: events } }, data: { status: 'released' } })
          await tx.schedule.updateMany({ where: { eventId: { in: events } }, data: { status: 'published' } })
          // Jean's row is flagged on both meetings (on the copies' through the copy, which its trigger mirrors).
          await tx.item.updateMany({ where: { eventId: seeded.copies, assigneeId: jean }, data: { hasConflict: true } })
          await tx.itemRoom.updateMany({
            where: { assigneeId: jean, item: { eventId: seeded.rows } },
            data: { hasConflict: true },
          })

          const byEvent = <T>(rows: T[], eventOf: (row: T) => number, label: (row: T) => string) => ({
            copies: rows.filter(row => eventOf(row) === seeded.copies).map(label),
            rows: rows.filter(row => eventOf(row) === seeded.rows).map(label),
          })
          const eventIdOf = (start: Date) => (start.toISOString().startsWith(days[0]) ? seeded.copies : seeded.rows)
          const since = new Date('2099-01-01')
          const lucAccount = (
            await tx.userAccount.create({
              data: { email: `luc-${stamp}@test.com`, password: 'x', memberId: luc, congregationId },
            })
          ).id
          const feed = (await getPersonalAssignments(db, jeanAccount, congregationId, since)).filter(
            item => item.kind !== 'day-off',
          )
          // The dashboard looks four weeks ahead.
          const upcoming = await getUpcomingAssignments(db, jean, congregationId, new Date('2099-03-01'))
          const member = await findUpcomingAssignmentsForMember(db, jean as never, congregationId as never, since)
          const conflicts = await listUserConflictsInRange(db, jean, since, new Date('2099-12-31'))
          // The dashboard's notice names the first conflict: with the copies' cleared, only the later meeting's row is.
          await tx.item.updateMany({
            where: { eventId: seeded.copies, assigneeId: jean },
            data: { hasConflict: false },
          })
          const notice = await getConflictingAssignments(db, jean)
          const sameEvent = async (eventId: number) =>
            (await listUserSameEventAssignments(db, { userId: jean, eventId, congregationId })).map(each => each.name)
          read = {
            partName: seeded.partName,
            feed: byEvent(
              feed,
              item => eventIdOf(item.start),
              item => item.summary,
            ),
            upcoming: byEvent(
              upcoming,
              item => eventIdOf(item.eventStartDate),
              item => `${item.name}:${item.role}:${item.partner?.firstname ?? '-'}`,
            ),
            member: byEvent(
              member,
              item => item.eventId,
              item => item.partName,
            ),
            conflicts: conflicts.map(each => `${each.eventDate.toISOString().slice(0, 10)}:${each.assignmentName}`),
            sameEvent: { copies: await sameEvent(seeded.copies), rows: await sameEvent(seeded.rows) },
            dashboardConflict:
              notice == null ? null : `${notice.eventStartDate.toISOString().slice(0, 10)}:${notice.name}`,
            second: {
              feed: byEvent(
                (await getPersonalAssignments(db, lucAccount, congregationId, since)).filter(
                  item => item.kind !== 'day-off',
                ),
                item => eventIdOf(item.start),
                item => `${item.kind}:${item.uid.split('-').slice(0, 3).join('-')}`,
              ),
              upcoming: byEvent(
                await getUpcomingAssignments(db, luc, congregationId, new Date('2099-03-01')),
                item => eventIdOf(item.eventStartDate),
                item => `${item.role}:${item.partner?.firstname ?? '-'}`,
              ),
            },
          }
          throw new Rollback()
        },
        { timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    if (read == null) throw new Error('nothing read')
    const { partName } = read
    expect(read.feed.copies).toHaveLength(1)
    expect(read.feed.rows).toEqual(read.feed.copies)
    expect(read.feed.copies[0]).toContain(partName)
    expect(read.upcoming.rows).toEqual(read.upcoming.copies)
    expect(read.upcoming.copies).toHaveLength(1)
    expect(read.member).toEqual({ copies: [partName], rows: [partName] })
    // The dashboard's « away on a day you have a part » notice, from the room's flag.
    expect(read.dashboardConflict).toBe(`2099-03-11:${partName}`)
    expect(read.conflicts).toEqual([`2099-03-04:${partName}`, `2099-03-11:${partName}`])
    expect(read.sameEvent).toEqual({ copies: [partName], rows: [partName] })
    // A second speaker in another room reads as one: his slot and partner are his room's.
    expect(read.second.feed).toEqual({
      copies: ['programme-part-assistant:programme-part-assistant'],
      rows: ['programme-part-assistant:programme-part-assistant'],
    })
    expect(read.second.upcoming).toEqual({ copies: ['reader:Jean'], rows: ['reader:Jean'] })
  })
})
