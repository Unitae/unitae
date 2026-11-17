import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

vi.mock('~/shared/domain/audit.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/shared/domain/audit.server')>()),
  audit: vi.fn(),
}))

// What a mocked client cannot vouch for: the attendant and the videoconference host enter their counts at the same
// moment, in two transactions, and both must stick; a recorder racing someone else on the same count loses cleanly.
// Under the runtime role, so row-level security applies.

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 4,
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

const { writeAttendanceCount } = await import('./attendance.aggregate')
const { ConflictError, ForbiddenError } = await import('~/shared/errors/app-error.server')

const PARIS = 'Europe/Paris'
const ts = Date.now()
let congregationId: number
let attendant: number
let host: number
let other: number
let templateId: number
let startDate: Date

function newMeeting(): Promise<number> {
  return withScope(congregationId, async tx => {
    const event = await tx.event.create({
      data: { name: 'Réunion du week-end', templateId, startDate, endDate: startDate, congregationId },
    })
    return event.id
  })
}

beforeAll(async () => {
  congregationId = (
    await testDb.congregation.create({ data: { name: `Attendance ${ts}`, slug: `attendance-${ts}`, active: true } })
  ).id
  await withScope(congregationId, async tx => {
    const account = async (name: string) =>
      (
        await tx.userAccount.create({
          data: { email: `${name}-${ts}@test.com`, password: 'hashed', active: true, congregationId },
        })
      ).id
    attendant = await account('attendant')
    host = await account('host')
    other = await account('other')
    templateId = (
      await tx.eventTemplate.create({
        data: { name: 'Week-end', key: `weekend-${ts}`, attendanceKind: 'weekend', congregationId },
      })
    ).id
  })
  // A fixed meeting and a fixed clock five minutes into it, so the entry window is open whatever the time the suite runs.
  startDate = new Date('2026-11-19T18:00:00Z')
})

afterAll(async () => {
  if (congregationId) {
    await withScope(congregationId, async tx => {
      await tx.attendance.deleteMany({})
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: congregationId } })
  }
  await testDb.$disconnect()
})

const write = (eventId: number, actorId: number, count: 'inPerson' | 'online', value: number) =>
  withScope(congregationId, tx =>
    writeAttendanceCount(tx, {
      congregationId,
      actorId,
      eventId,
      count,
      value,
      canRecord: true,
      canCorrect: false,
      timeZone: PARIS,
      now: new Date(startDate.getTime() + 5 * 60 * 1000),
    }),
  )

describe('writeAttendanceCount', () => {
  it('keeps both first counts when the hall and the videoconference arrive together', async () => {
    const eventId = await newMeeting()

    await Promise.all([write(eventId, attendant, 'inPerson', 98), write(eventId, host, 'online', 21)])

    const row = await withScope(congregationId, tx => tx.attendance.findFirst({ where: { eventId } }))
    expect(row).toMatchObject({ inPerson: 98, inPersonById: attendant, online: 21, onlineById: host })
  })

  it('lets only one of two recorders racing on the same empty count win, and refuses the other', async () => {
    const eventId = await newMeeting()

    const results = await Promise.allSettled([
      write(eventId, attendant, 'inPerson', 98),
      write(eventId, other, 'inPerson', 97),
    ])

    const rejected = results.filter(result => result.status === 'rejected')
    expect(rejected).toHaveLength(1)
    // ConflictError when both read the count empty and the second write's condition failed; ForbiddenError when the
    // first had already committed before the second read it. Either way the loser wrote nothing.
    const reason = (rejected[0] as PromiseRejectedResult).reason
    expect(reason instanceof ConflictError || reason instanceof ForbiddenError).toBe(true)
    const row = await withScope(congregationId, tx => tx.attendance.findFirst({ where: { eventId } }))
    expect([98, 97]).toContain(row?.inPerson)
    expect(row?.inPersonById).toBe(row?.inPerson === 98 ? attendant : other)
  })
})
