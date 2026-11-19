import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// While the readers still read the day-off events, an absence is written twice, in one transaction: the event, and its
// Absence row — the person's record when the account has one. Deleting it removes both.

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

const { createDayOff, deleteDayOff } = await import('./days-off.server')

const ts = Date.now()
const ids = { cong: 0, other: 0, member: 0, account: 0, accountWithoutRecord: 0 }
const START = new Date('2027-04-05T00:00:00Z')
const END = new Date('2027-04-09T23:59:00Z')

beforeAll(async () => {
  for (const key of ['cong', 'other'] as const) {
    const congregationId = (
      await testDb.congregation.create({
        data: { name: `Days off ${key} ${ts}`, slug: `days-off-${key}-${ts}`, active: true },
      })
    ).id
    ids[key] = congregationId
    await withScope(congregationId, async tx => {
      await tx.eventTemplate.create({ data: { name: 'Absence', key: 'day-off', congregationId } })
      const member = await tx.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })
      const account = await tx.userAccount.create({
        data: { email: `paul-${key}-${ts}@test.com`, password: 'x', memberId: member.id, congregationId },
      })
      const withoutRecord = await tx.userAccount.create({
        data: { email: `sans-${key}-${ts}@test.com`, password: 'x', congregationId },
      })
      if (key === 'cong') {
        ids.member = member.id
        ids.account = account.id
        ids.accountWithoutRecord = withoutRecord.id
      }
      // One absence each before any test: the isolation test reads both sides.
      await createDayOff(tx, account.id, member.id, START, END, congregationId)
    })
  }
})

afterAll(async () => {
  for (const congregationId of [ids.cong, ids.other]) {
    if (!congregationId) continue
    await withScope(congregationId, async tx => {
      await tx.absence.deleteMany({})
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.member.deleteMany({})
    })
    await testDb.auditLog.deleteMany({ where: { congregationId } })
    await testDb.congregation.deleteMany({ where: { id: congregationId } })
  }
  await testDb.$disconnect()
})

const absenceOf = (eventId: number) =>
  withScope(ids.cong, tx =>
    tx.absence.findFirst({
      where: { legacyEventId: eventId },
      select: { startDate: true, endDate: true, memberId: true, accountId: true, congregationId: true },
    }),
  )

describe('an absence written twice', () => {
  it('writes the event and its Absence row, with the person’s record', async () => {
    const event = await withScope(ids.cong, tx => createDayOff(tx, ids.account, ids.member, START, END, ids.cong))

    expect(await absenceOf(event?.eventId as number)).toEqual({
      startDate: START,
      endDate: END,
      memberId: ids.member,
      accountId: ids.account,
      congregationId: ids.cong,
    })
  })

  it('keeps the account as the owner when it has no record', async () => {
    const event = await withScope(ids.cong, tx =>
      createDayOff(tx, ids.accountWithoutRecord, null, START, END, ids.cong),
    )

    expect(await absenceOf(event?.eventId as number)).toMatchObject({
      memberId: null,
      accountId: ids.accountWithoutRecord,
    })
  })

  it('deletes the event and its Absence row together', async () => {
    const event = await withScope(ids.cong, tx => createDayOff(tx, ids.account, ids.member, START, END, ids.cong))
    const eventId = event?.eventId as number
    expect(await absenceOf(eventId)).not.toBeNull()

    await withScope(ids.cong, tx =>
      deleteDayOff(tx, {
        absenceId: event?.absenceId as number,
        accountId: ids.account,
        memberId: ids.member,
        congregationId: ids.cong,
      }),
    )

    expect(await absenceOf(eventId)).toBeNull()
    expect(await withScope(ids.cong, tx => tx.event.findFirst({ where: { id: eventId } }))).toBeNull()
  })

  it('never shows another congregation’s absences, nor writes into them', async () => {
    const ours = await withScope(ids.cong, tx => tx.absence.count({ where: { congregationId: ids.cong } }))
    const seen = await withScope(ids.cong, tx => tx.absence.count())
    const theirs = await withScope(ids.other, tx => tx.absence.count())
    const intrusion = withScope(ids.cong, tx =>
      tx.absence.create({
        data: { startDate: START, endDate: END, accountId: ids.account, congregationId: ids.other },
      }),
    )

    expect(theirs).toBe(1)
    expect(ours).toBeGreaterThan(0)
    expect(seen).toBe(ours)
    await expect(intrusion).rejects.toThrow()
  })

  // Once the day-off events and their template are dropped: declaring and cancelling an absence keep working, with the
  // Absence row alone.
  it('declares and cancels an absence with no day-off template, as a row alone', async () => {
    const congregationId = (
      await testDb.congregation.create({
        data: { name: `Days off bare ${ts}`, slug: `days-off-bare-${ts}`, active: true },
      })
    ).id
    try {
      const outcome = await withScope(congregationId, async tx => {
        const member = await tx.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })
        const account = await tx.userAccount.create({
          data: { email: `paul-bare-${ts}@test.com`, password: 'x', memberId: member.id, congregationId },
        })
        const created = await createDayOff(tx, account.id, member.id, START, END, congregationId)
        const row = await tx.absence.findFirst({ where: { id: created?.absenceId }, select: { legacyEventId: true } })
        const events = await tx.event.count()
        const cancelled = await deleteDayOff(tx, {
          absenceId: created?.absenceId as number,
          accountId: account.id,
          memberId: member.id,
          congregationId,
        })
        return { created, row, events, cancelled, left: await tx.absence.count() }
      })

      expect(outcome.created?.eventId).toBeNull()
      expect(outcome.row).toEqual({ legacyEventId: null })
      expect(outcome.events).toBe(0)
      expect(outcome.cancelled).toMatchObject({ startDate: START, endDate: END })
      expect(outcome.left).toBe(0)
    } finally {
      await withScope(congregationId, async tx => {
        await tx.absence.deleteMany({})
        await tx.userAccount.deleteMany({})
        await tx.member.deleteMany({})
      })
      await testDb.auditLog.deleteMany({ where: { congregationId } })
      await testDb.congregation.deleteMany({ where: { id: congregationId } })
    }
  })
})
