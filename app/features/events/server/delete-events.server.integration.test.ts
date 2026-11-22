import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { settleFixtureSchedules } from '~/tests/helpers/settle-fixture-schedules'

// What a mocked client cannot vouch for: `Attendance.eventId` cascades on delete, so only the code stands between
// deleting a programme and losing a meeting's counts. Run for real, under the runtime role, so row-level security
// applies to every read the rule makes.

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

const { bulkDeleteEvents, deleteEvent } = await import('./delete-events.server')
const { deletePartAssignment, deleteServicePartAssignment } = await import('./event-parts.server')

const ts = Date.now()
let congregationId: number
let actorId: number
let templateId: number

interface Meeting {
  eventId: number
  partId: number
  serviceId: number
  noticeId: number
  serviceNoticeId: number
  /** Notices the previous image wrote about the old rows during a rollout (plan T12, 5i-b). */
  legacyNoticeIds: number[]
}

/** A published meeting with one part, one service and a pending notice for its part; counts as given. */
function meeting(counts: { inPerson: number | null; online: number | null } | null): Promise<Meeting> {
  return withScope(congregationId, async tx => {
    const day = new Date('2026-11-15T09:00:00Z')
    const event = await tx.event.create({
      data: { name: 'Réunion', templateId, startDate: day, endDate: day, status: 'released', congregationId },
    })
    const part = await tx.eventPart.create({ data: { eventId: event.id, name: 'Discours', congregationId } })
    const service = await tx.eventServicePart.create({ data: { eventId: event.id, name: 'Accueil', congregationId } })
    // The writers hand out item ids and name items in notices: the mirrored item of each old row, in its schedule.
    await settleFixtureSchedules(tx, congregationId)
    const partItem = await tx.item.findUniqueOrThrow({ where: { legacyPartId: part.id } })
    const serviceItem = await tx.item.findUniqueOrThrow({ where: { legacyServiceId: service.id } })
    const notice = await tx.notificationEvent.create({
      data: {
        type: 'part_assigned',
        entityType: 'Item',
        entityId: partItem.id,
        debounceKey: `part-${partItem.id}`,
        congregationId,
      },
    })
    const serviceNotice = await tx.notificationEvent.create({
      data: {
        type: 'part_assigned',
        entityType: 'Item',
        entityId: serviceItem.id,
        debounceKey: `service-${serviceItem.id}`,
        congregationId,
      },
    })
    const legacyNotices = await Promise.all(
      [
        ['EventPart', part.id],
        ['EventServicePart', service.id],
      ].map(([entityType, entityId]) =>
        tx.notificationEvent.create({
          data: {
            type: 'part_assigned',
            entityType: entityType as string,
            entityId: entityId as number,
            debounceKey: `${entityType}:${entityId}:user:1`,
            congregationId,
          },
        }),
      ),
    )
    if (counts) await tx.attendance.create({ data: { eventId: event.id, ...counts, congregationId } })
    return {
      eventId: event.id,
      partId: partItem.id,
      serviceId: serviceItem.id,
      noticeId: notice.id,
      serviceNoticeId: serviceNotice.id,
      legacyNoticeIds: legacyNotices.map(legacy => legacy.id),
    }
  })
}

beforeAll(async () => {
  congregationId = (
    await testDb.congregation.create({ data: { name: `Delete ${ts}`, slug: `delete-${ts}`, active: true } })
  ).id
  await withScope(congregationId, async tx => {
    actorId = (
      await tx.userAccount.create({
        data: { email: `delete-${ts}@test.com`, password: 'hashed', active: true, congregationId },
      })
    ).id
    templateId = (
      await tx.eventTemplate.create({
        data: { name: 'Week-end', key: `weekend-${ts}`, attendanceKind: 'weekend', congregationId },
      })
    ).id
  })
})

afterAll(async () => {
  if (congregationId) {
    await withScope(congregationId, async tx => {
      await tx.notificationEvent.deleteMany({})
      await tx.auditLog.deleteMany({})
      await tx.attendance.deleteMany({})
      await tx.eventServicePart.deleteMany({})
      await tx.eventPart.deleteMany({})
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: congregationId } })
  }
  await testDb.$disconnect()
})

const state = (m: Meeting) =>
  withScope(congregationId, async tx => ({
    event: await tx.event.findFirst({ where: { id: m.eventId }, select: { status: true } }),
    attendance: await tx.attendance.findFirst({ where: { eventId: m.eventId } }),
    parts: await tx.item.count({ where: { eventId: m.eventId, schedule: { kind: 'programme' } } }),
    services: await tx.item.count({ where: { eventId: m.eventId, schedule: { kind: 'duty' } } }),
    notice: await tx.notificationEvent.findFirst({ where: { id: m.noticeId }, select: { status: true } }),
    serviceNotice: await tx.notificationEvent.findFirst({ where: { id: m.serviceNoticeId }, select: { status: true } }),
    legacyNotices: (
      await tx.notificationEvent.findMany({ where: { id: { in: m.legacyNoticeIds } }, select: { status: true } })
    ).map(row => row.status),
    audits: (await tx.auditLog.findMany({ where: { entityType: 'Event', entityId: m.eventId } })).map(a => a.action),
  }))

describe('bulkDeleteEvents', () => {
  it('cancels the notices the previous image wrote about the old rows of a programme it removes', async () => {
    const counted = await meeting({ inPerson: 80, online: 12 })
    const plain = await meeting(null)

    await withScope(congregationId, tx =>
      bulkDeleteEvents(tx, [counted.eventId, plain.eventId], congregationId, actorId),
    )

    expect((await state(counted)).legacyNotices).toEqual(['cancelled', 'cancelled'])
    const left = await withScope(congregationId, tx =>
      tx.notificationEvent.findMany({ where: { id: { in: plain.legacyNoticeIds } }, select: { status: true } }),
    )
    // A deleted event's notices are cancelled before it goes; they stay as history.
    expect(left.map(row => row.status)).toEqual(['cancelled', 'cancelled'])
  })

  it('keeps a meeting with counts as a draft without its programme, and deletes the others', async () => {
    const counted = await meeting({ inPerson: 98, online: 21 })
    const plain = await meeting(null)

    const result = await withScope(congregationId, tx =>
      bulkDeleteEvents(tx, [counted.eventId, plain.eventId], congregationId, actorId),
    )

    expect(result).toEqual({ count: 1, emptied: 1 })
    const kept = await state(counted)
    expect(kept.event).toEqual({ status: 'draft' })
    expect(kept.attendance).toMatchObject({ inPerson: 98, online: 21 })
    expect(kept.parts).toBe(0)
    expect(kept.services).toBe(0)
    expect(kept.notice).toEqual({ status: 'cancelled' })
    expect(kept.audits).toEqual(['event.programme_removed'])
    const gone = await state(plain)
    expect(gone.event).toBeNull()
    expect(gone.audits).toEqual(['event.deleted'])
  })

  it('deletes a meeting whose counts were all cleared', async () => {
    const cleared = await meeting({ inPerson: null, online: null })

    const result = await withScope(congregationId, tx =>
      bulkDeleteEvents(tx, [cleared.eventId], congregationId, actorId),
    )

    expect(result).toEqual({ count: 1, emptied: 0 })
    expect((await state(cleared)).event).toBeNull()
  })
})

describe('deleteEvent', () => {
  it('keeps a meeting with a single count and says so', async () => {
    const half = await meeting({ inPerson: 98, online: null })

    const result = await withScope(congregationId, tx => deleteEvent(tx, half.eventId, congregationId, actorId))

    expect(result).toEqual({ kept: true })
    const kept = await state(half)
    expect(kept.event).toEqual({ status: 'draft' })
    expect(kept.attendance).toMatchObject({ inPerson: 98 })
  })
})

// A notice still waiting for an item that no longer exists would e-mail someone about a part they no longer have.
describe('the notices still waiting when a programme goes', () => {
  it('are cancelled when the meeting is deleted', async () => {
    const plain = await meeting(null)

    await withScope(congregationId, tx => deleteEvent(tx, plain.eventId, congregationId, actorId))

    const after = await state(plain)
    expect([after.notice, after.serviceNotice]).toEqual([{ status: 'cancelled' }, { status: 'cancelled' }])
  })

  it('are cancelled when meetings are deleted in bulk', async () => {
    const plain = await meeting(null)

    await withScope(congregationId, tx => bulkDeleteEvents(tx, [plain.eventId], congregationId, actorId))

    const after = await state(plain)
    expect([after.notice, after.serviceNotice]).toEqual([{ status: 'cancelled' }, { status: 'cancelled' }])
  })

  it('are cancelled with the one part or service removed from a programme, and only theirs', async () => {
    const kept = await meeting(null)

    await withScope(congregationId, tx => deletePartAssignment(tx, kept.partId, congregationId))
    expect((await state(kept)).notice).toEqual({ status: 'cancelled' })
    expect((await state(kept)).serviceNotice).toEqual({ status: 'pending' })

    await withScope(congregationId, tx => deleteServicePartAssignment(tx, kept.serviceId, congregationId))
    expect((await state(kept)).serviceNotice).toEqual({ status: 'cancelled' })
  })
})
