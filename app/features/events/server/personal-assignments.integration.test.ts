import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EventKind } from '~/features/events/model/event-kind.type'
import { getPersonalAssignments } from '~/features/events/server/personal-assignments.server'
import { PublisherType } from '~/shared/types/publisher-type'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
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

const ts = Date.now()
let congAId: number
let congBId: number
let aliceId: number
let bobId: number
let evergreenId: number
let foreignAssignmentId: number

beforeAll(async () => {
  const congA = await testDb.congregation.create({
    data: { name: `Calendar Test A ${ts}`, slug: `calendar-test-a-${ts}`, active: true },
  })
  const congB = await testDb.congregation.create({
    data: { name: `Calendar Test B ${ts}`, slug: `calendar-test-b-${ts}`, active: true },
  })
  congAId = congA.id
  congBId = congB.id

  await withScope(congAId, async tx => {
    const alice = await tx.user.create({
      data: {
        email: `alice-cal-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Alice',
        lastname: 'Cal',
        active: true,
        isPublisher: true,
        type: PublisherType.Normal,
        congregationId: congAId,
      },
    })
    aliceId = alice.id

    const offKind = await tx.eventKind.create({
      data: {
        name: 'Off',
        key: EventKind.Off,
        color: '#000000',
        congregationId: congAId,
      },
    })

    const meetingEvent = await tx.event.create({
      data: {
        name: `Réunion ${ts}`,
        startDate: new Date('2026-06-10T18:00:00Z'),
        endDate: new Date('2026-06-10T20:00:00Z'),
        createdById: aliceId,
        congregationId: congAId,
      },
    })

    const dayOff = await tx.event.create({
      data: {
        name: 'Absence',
        startDate: new Date('2026-06-15T00:00:00Z'),
        endDate: new Date('2026-06-17T00:00:00Z'),
        kindId: offKind.id,
        createdById: aliceId,
        congregationId: congAId,
      },
    })
    evergreenId = dayOff.id

    await tx.programmePartAssignment.create({
      data: {
        name: 'Trésors',
        section: 'Section 1',
        topic: 'Sujet test',
        eventId: meetingEvent.id,
        assigneeId: aliceId,
        congregationId: congAId,
      },
    })

    await tx.programmeServiceRoleAssignment.create({
      data: {
        name: 'Sono',
        eventId: meetingEvent.id,
        assigneeId: aliceId,
        congregationId: congAId,
      },
    })
  })

  await withScope(congBId, async tx => {
    const bob = await tx.user.create({
      data: {
        email: `bob-cal-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Bob',
        lastname: 'Cal',
        active: true,
        isPublisher: true,
        type: PublisherType.Normal,
        congregationId: congBId,
      },
    })
    bobId = bob.id

    const meetingEvent = await tx.event.create({
      data: {
        name: `Réunion B ${ts}`,
        startDate: new Date('2026-06-11T18:00:00Z'),
        endDate: new Date('2026-06-11T20:00:00Z'),
        createdById: bobId,
        congregationId: congBId,
      },
    })

    const foreign = await tx.programmePartAssignment.create({
      data: {
        name: 'Foreign',
        section: 'X',
        eventId: meetingEvent.id,
        assigneeId: bobId,
        congregationId: congBId,
      },
    })
    foreignAssignmentId = foreign.id
  })
})

afterAll(async () => {
  // FK-safe deletion order: assignments → events → kinds → users → congregations
  await testDb.programmePartAssignment.deleteMany({
    where: { congregationId: { in: [congAId, congBId] } },
  })
  await testDb.programmeServiceRoleAssignment.deleteMany({
    where: { congregationId: { in: [congAId, congBId] } },
  })
  await testDb.event.deleteMany({ where: { congregationId: { in: [congAId, congBId] } } })
  await testDb.eventKind.deleteMany({ where: { congregationId: { in: [congAId, congBId] } } })
  await testDb.userAccount.deleteMany({ where: { congregationId: { in: [congAId, congBId] } } })
  await testDb.congregation.deleteMany({ where: { id: { in: [congAId, congBId] } } })
  await testDb.$disconnect()
})

describe('getPersonalAssignments', () => {
  const since = new Date('2026-01-01T00:00:00Z')

  it('returns the user own programme assignments and days off', async () => {
    const items = await withScope(congAId, db => getPersonalAssignments(db, aliceId, since))

    const kinds = items.map(i => i.kind).sort()
    expect(kinds).toEqual(['day-off', 'programme-part', 'programme-service-role'])

    const dayOff = items.find(i => i.kind === 'day-off')
    expect(dayOff).toBeDefined()
    expect(dayOff?.uid).toBe(`day-off-${evergreenId}`)
    expect(dayOff?.allDay).toBe(true)

    const part = items.find(i => i.kind === 'programme-part')
    expect(part?.summary).toContain('Trésors')
  })

  it('does not leak assignments from another congregation under RLS', async () => {
    // Scope is congregation B but we are asking for Alice's assignments.
    // RLS blocks Alice's data from being visible.
    const items = await withScope(congBId, db => getPersonalAssignments(db, aliceId, since))

    expect(items).toEqual([])

    // And asking for Bob's data while scoped to B does see Bob's assignment.
    const bobItems = await withScope(congBId, db => getPersonalAssignments(db, bobId, since))
    expect(bobItems.length).toBeGreaterThanOrEqual(1)
    expect(bobItems.some(i => i.uid === `programme-part-assignee-${foreignAssignmentId}`)).toBe(true)
  })
})

describe('CalendarFeedToken roundtrip', () => {
  it('persists a token that can be looked up to find the user', async () => {
    const token = `tok-${ts}`
    await testDb.calendarFeedToken.create({
      data: { token, userId: aliceId },
    })

    const found = await testDb.calendarFeedToken.findUnique({
      where: { token },
      include: { user: true },
    })

    expect(found).not.toBeNull()
    expect(found?.user.id).toBe(aliceId)
    expect(found?.user.congregationId).toBe(congAId)

    await testDb.calendarFeedToken.delete({ where: { id: found?.id ?? 0 } })
  })
})
