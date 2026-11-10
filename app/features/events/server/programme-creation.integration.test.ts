// Programme creation against a real database, in a congregation west of UTC: the unit suite (mocked Prisma) cannot
// tell whether the day bounds used to find the programmes that already exist are the congregation's days.

import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { createProgrammeOnDay, createProgrammeSeries } from '~/features/events/server/programme-creation.server'
import { combineLocalDateTime } from '~/shared/utils/event-time'

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

const MARTINIQUE = 'America/Martinique'
const ts = Date.now()
let congId: number
let accountId: number
let midweekId: number
let memorialId: number
let dayOffId: number

const ctx = () => ({ congregationId: congId, timezone: MARTINIQUE, actorId: accountId })

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `ProgrammeCreation ${ts}`, slug: `programme-creation-${ts}`, active: true, timezone: MARTINIQUE },
  })
  congId = cong.id

  await withScope(congId, async tx => {
    const account = await tx.userAccount.create({
      data: { email: `creator-${ts}@test.com`, password: 'hashed', active: true, congregationId: congId },
    })
    accountId = account.id
    const midweek = await tx.eventTemplate.create({
      data: {
        name: 'Réunion de semaine',
        key: `midweek-${ts}`,
        weekDay: 4,
        startTime: '19:00',
        endTime: '20:45',
        congregationId: congId,
        parts: { create: [{ name: 'Joyaux', order: 1, durationMin: 10, congregationId: congId }] },
      },
    })
    midweekId = midweek.id
    const memorial = await tx.eventTemplate.create({
      data: { name: 'Mémorial', key: `memorial-${ts}`, isRecurring: false, congregationId: congId },
    })
    memorialId = memorial.id
    const dayOff = await tx.eventTemplate.create({
      data: { name: 'Absence', key: 'day-off', isRecurring: false, congregationId: congId },
    })
    dayOffId = dayOff.id
    // Thursday 19 November, 19:00 in Martinique: already Friday in UTC.
    await tx.event.create({
      data: {
        name: 'Réunion de semaine',
        templateId: midweek.id,
        startDate: combineLocalDateTime('2026-11-19', '19:00', MARTINIQUE),
        endDate: combineLocalDateTime('2026-11-19', '20:45', MARTINIQUE),
        createdById: account.id,
        congregationId: congId,
      },
    })
  })
})

afterAll(async () => {
  await testDb.eventPart.deleteMany({ where: { congregationId: congId } })
  await testDb.templatePart.deleteMany({ where: { congregationId: congId } })
  await testDb.event.deleteMany({ where: { congregationId: congId } })
  await testDb.eventTemplate.deleteMany({ where: { congregationId: congId } })
  await testDb.auditLog.deleteMany({ where: { congregationId: congId } })
  await testDb.userAccount.deleteMany({ where: { congregationId: congId } })
  await testDb.congregation.delete({ where: { id: congId } })
  await testDb.$disconnect()
})

describe('programme creation west of UTC (integration)', () => {
  it('creates the missing Thursdays and recognises the one that exists, on Martinique days', async () => {
    const result = await withScope(congId, tx =>
      createProgrammeSeries(tx, { templateIds: [midweekId], from: '2026-11-12', to: '2026-11-26' }, ctx()),
    )

    expect(result.created.map(programme => programme.day)).toEqual(['2026-11-12', '2026-11-26'])
    expect(result.existing).toBe(1)

    const created = await testDb.event.findMany({
      where: { id: { in: result.created.map(programme => programme.id) } },
      orderBy: { startDate: 'asc' },
      select: { startDate: true, _count: { select: { eventParts: true } } },
    })
    expect(created.map(event => event.startDate.toISOString())).toEqual([
      '2026-11-12T23:00:00.000Z',
      '2026-11-26T23:00:00.000Z',
    ])
    expect(created.map(event => event._count.eventParts)).toEqual([1, 1])

    const audit = await testDb.auditLog.findMany({
      where: { congregationId: congId, action: 'event.created' },
      select: { entityId: true, actorId: true },
    })
    expect(audit).toEqual(
      expect.arrayContaining(result.created.map(programme => ({ entityId: programme.id, actorId: accountId }))),
    )
  })

  it('refuses a second programme of the template on a Martinique day, naming the first', async () => {
    const refusal = await withScope(congId, tx =>
      createProgrammeOnDay(tx, { templateId: midweekId, day: '2026-11-19' }, ctx()),
    ).catch(error => error)

    expect(refusal).toMatchObject({ message: 'programme_exists' })
    expect(typeof refusal.eventId).toBe('number')
  })

  it('creates the Memorial on its day', async () => {
    const created = await withScope(congId, tx =>
      createProgrammeOnDay(tx, { templateId: memorialId, day: '2027-03-23' }, ctx()),
    )

    const event = await testDb.event.findUniqueOrThrow({ where: { id: created.id }, select: { startDate: true } })
    expect(event.startDate.toISOString()).toBe('2027-03-23T23:00:00.000Z')
  })

  it('never creates a programme from the absence template', async () => {
    await expect(
      withScope(congId, tx => createProgrammeOnDay(tx, { templateId: dayOffId, day: '2027-01-14' }, ctx())),
    ).rejects.toThrow()
  })
})
