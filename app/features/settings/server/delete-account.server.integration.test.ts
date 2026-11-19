import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Deleting an account must not end in a foreign-key error on the events it created. Its absences go with it when it
// has no record: they belong to nobody else. An account linked to a record keeps them, so it is refused until they can
// be handed to the record. Its other events lose their author and stay what they were: a hand-made event never becomes
// an empty meeting a template may move or delete.

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

const { deleteAccount } = await import('./delete-account.server')
const { countMeetingsToMove, deleteTemplate, moveEmptyMeetings } = await import('~/features/events/index.server')
const { Permission } = await import('~/shared/types/permission')

const ADMIN = new Set<string>([Permission.CanDoAnything])
const ts = Date.now()
const ids = { cong: 0, admin: 0, dayOffTemplate: 0, meetingTemplate: 0 }
const DAY = new Date('2027-01-12T18:00:00Z')

beforeAll(async () => {
  ids.cong = (
    await testDb.congregation.create({ data: { name: `Delete ${ts}`, slug: `delete-${ts}`, active: true } })
  ).id
  await withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    const adminRole = await tx.role.create({ data: { key: 'admin', isBuiltIn: true, congregationId } })
    ids.admin = (
      await tx.userAccount.create({ data: { email: `admin-${ts}@test.com`, password: 'x', congregationId } })
    ).id
    await tx.userRoleAssignment.create({ data: { userId: ids.admin, roleId: adminRole.id, congregationId } })
    ids.dayOffTemplate = (
      await tx.eventTemplate.create({ data: { name: 'Absence', key: 'day-off', congregationId } })
    ).id
    ids.meetingTemplate = (
      await tx.eventTemplate.create({
        data: { name: 'Réunion de semaine', key: 'midweek-meeting', weekDay: 2, congregationId },
      })
    ).id
  })
})

afterAll(async () => {
  if (ids.cong) {
    await withScope(ids.cong, async tx => {
      await tx.absence.deleteMany({})
      await tx.event.deleteMany({})
      await tx.eventTemplate.deleteMany({})
      await tx.userRoleAssignment.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.member.deleteMany({})
      await tx.role.deleteMany({})
    })
    await testDb.auditLog.deleteMany({ where: { congregationId: ids.cong } })
    await testDb.congregation.deleteMany({ where: { id: ids.cong } })
  }
  await testDb.$disconnect()
})

/** An account, with a record when asked, an absence when asked, and an empty meeting it made by hand. */
async function account(name: string, { record, absence }: { record: boolean; absence: boolean }) {
  return withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    const memberId = record
      ? (await tx.member.create({ data: { firstname: name, lastname: 'TEST', congregationId } })).id
      : null
    const accountId = (
      await tx.userAccount.create({
        data: { email: `${name}-${ts}@test.com`, password: 'x', memberId, congregationId },
      })
    ).id
    const event = (templateId: number, extra: object = {}) =>
      tx.event.create({
        data: { name, startDate: DAY, endDate: DAY, templateId, createdById: accountId, congregationId, ...extra },
      })
    const absenceId = absence ? (await event(ids.dayOffTemplate, { status: 'released' })).id : null
    // Written twice, as createDayOff does: the event and its Absence row.
    if (absenceId != null) {
      await tx.absence.create({
        data: { startDate: DAY, endDate: DAY, memberId, accountId, legacyEventId: absenceId, congregationId },
      })
    }
    const meetingId = (await event(ids.meetingTemplate)).id
    return { accountId, memberId, absenceId, meetingId }
  })
}

const remove = (accountId: number) =>
  withScope(ids.cong, tx => deleteAccount(tx, accountId as never, ids.cong, ids.admin, ADMIN))

const absencesOf = (accountId: number) => withScope(ids.cong, tx => tx.absence.count({ where: { accountId } }))

/** A record's absences, as every list reads them. */
const absencesOfRecord = (memberId: number | null) =>
  withScope(ids.cong, tx =>
    tx.absence.findMany({ where: { memberId: memberId ?? -1 }, select: { accountId: true, legacyEventId: true } }),
  )

const eventsOf = (eventIds: (number | null)[]) =>
  withScope(ids.cong, tx =>
    tx.event.findMany({
      where: { id: { in: eventIds.filter((id): id is number => id != null) } },
      select: { id: true, createdById: true, origin: true },
    }),
  )

describe('deleteAccount and the events the account created', () => {
  it('deletes an account without a record with its absences, and clears its author elsewhere', async () => {
    const { accountId, absenceId, meetingId } = await account('Sans-fiche', { record: false, absence: true })

    await remove(accountId)

    const left = await withScope(ids.cong, tx => tx.userAccount.findFirst({ where: { id: accountId } }))
    expect(left).toBeNull()
    expect(await eventsOf([absenceId, meetingId])).toEqual([{ id: meetingId, createdById: null, origin: 'manual' }])
    expect(await absencesOf(accountId)).toBe(0)
  })

  // The absences are the person's: they stay on the record, without the account; only their day-off events go.
  it('deletes an account linked to a record, keeping its absences on the record', async () => {
    const { accountId, memberId, absenceId, meetingId } = await account('Avec-fiche', { record: true, absence: true })

    const result = await remove(accountId)

    expect(result.memberId).toBe(memberId)
    const left = await withScope(ids.cong, tx => tx.userAccount.findFirst({ where: { id: accountId } }))
    expect(left).toBeNull()
    expect(await eventsOf([absenceId, meetingId])).toEqual([{ id: meetingId, createdById: null, origin: 'manual' }])
    expect(await absencesOfRecord(memberId)).toEqual([{ accountId: null, legacyEventId: absenceId }])
  })

  // A day-off the previous image wrote alone during the rollout is not lost with its event.
  it('gives the record a row for a day-off that had none before deleting the account', async () => {
    const { accountId, memberId, absenceId } = await account('Sans-ligne', { record: true, absence: true })
    await withScope(ids.cong, tx => tx.absence.deleteMany({ where: { legacyEventId: absenceId } }))

    await remove(accountId)

    expect(await eventsOf([absenceId])).toEqual([])
    expect(await absencesOfRecord(memberId)).toEqual([{ accountId: null, legacyEventId: absenceId }])
  })

  // An Absence row whose event a previous version deleted without it still names the account (Restrict).
  it('deletes an account linked to a record whose only absence row lost its event, keeping the row', async () => {
    const { accountId, memberId } = await account('Reste', { record: true, absence: false })
    await withScope(ids.cong, async tx => {
      const { memberId } = await tx.userAccount.findFirstOrThrow({
        where: { id: accountId },
        select: { memberId: true },
      })
      await tx.absence.create({
        data: {
          startDate: DAY,
          endDate: DAY,
          memberId,
          accountId,
          legacyEventId: 999_999_999,
          congregationId: ids.cong,
        },
      })
    })

    await remove(accountId)

    expect(await absencesOf(accountId)).toBe(0)
    expect(await absencesOfRecord(memberId)).toEqual([{ accountId: null, legacyEventId: 999_999_999 }])
  })

  // Declared while the account was being linked, a row can be on no record: it is the person's too, and moves there.
  it('moves a row on no record onto the record before deleting the account', async () => {
    const { accountId, memberId } = await account('Sans-fiche-encore', { record: true, absence: false })
    await withScope(ids.cong, tx =>
      tx.absence.create({ data: { startDate: DAY, endDate: DAY, accountId, congregationId: ids.cong } }),
    )

    await remove(accountId)

    expect(await absencesOf(accountId)).toBe(0)
    expect(await absencesOfRecord(memberId)).toEqual([{ accountId: null, legacyEventId: null }])
  })

  it('deletes an account linked to a record without absences, clearing its author', async () => {
    const { accountId, meetingId } = await account('Fiche-sans-absence', { record: true, absence: false })

    const result = await remove(accountId)

    expect(result.memberId).not.toBeNull()
    expect(await eventsOf([meetingId])).toEqual([{ id: meetingId, createdById: null, origin: 'manual' }])
  })

  // The bug this guards: an event without an author used to read as the job's. Once their accounts are gone, the
  // hand-made meetings above have none — they must still not move with their template, nor go with it.
  it('leaves the meetings the deleted accounts made where they are when their template changes day or goes', async () => {
    const ctx = { congregationId: ids.cong, timeZone: 'Europe/Paris', now: new Date('2027-01-01T09:00:00Z') }
    const before = await withScope(ids.cong, tx =>
      tx.event.findMany({ where: { templateId: ids.meetingTemplate, createdById: null }, select: { id: true } }),
    )
    expect(before.length).toBeGreaterThan(0)

    await withScope(ids.cong, tx =>
      tx.eventTemplate.update({ where: { id: ids.meetingTemplate }, data: { weekDay: 4 } }),
    )
    const toMove = await withScope(ids.cong, tx => countMeetingsToMove(tx, ids.meetingTemplate, ctx))
    const moved = await withScope(ids.cong, tx =>
      moveEmptyMeetings(tx, ids.meetingTemplate, { ...ctx, actorId: ids.admin }),
    )
    const removal = await withScope(ids.cong, tx => deleteTemplate(tx, ids.meetingTemplate, ids.cong, ids.admin))

    expect(toMove).toBe(0)
    expect(moved).toEqual({ moved: 0, removed: 0 })
    expect(removal).toMatchObject({ ok: false, reason: 'in-use' })
    const after = await withScope(ids.cong, tx =>
      tx.event.findMany({ where: { id: { in: before.map(event => event.id) } }, select: { startDate: true } }),
    )
    expect(after.map(event => event.startDate)).toEqual(before.map(() => DAY))
  })
})
