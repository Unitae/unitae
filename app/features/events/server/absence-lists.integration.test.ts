import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// The lists of absences read their own table, by the person: their record when they have one, the account that
// declared them otherwise. « Mes absences », the congregation's list, the dashboard, the publisher record and the
// calendar feed all show Absence rows; a day-off event without one (as an image from before the absences table writes during the rollout)
// no longer shows on its own, and an absence is deleted by its row.

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

const { listMyAbsences, listCongregationAbsences, congregationHasAbsences } = await import('./days-off.queries')
const { getNextDaysOffs, deleteDayOff } = await import('./days-off.server')
const { findUpcomingAbsencesForMember, findNextAbsencesForMembers } = await import('./member-engagement.queries')
const { getPersonalAssignments } = await import('./personal-assignments.server')
const { createDayOff } = await import('./days-off.server')
const { releaseAccountEvents } = await import('./account-events.server')

const ts = Date.now()
const ids = {
  cong: 0,
  paul: 0,
  paulAccount: 0,
  samAccount: 0,
  paulRow: 0,
  samRow: 0,
  dualRow: 0,
  dualEvent: 0,
  marieRow: 0,
  leaRow: 0,
}
const NOW = new Date('2027-05-01T08:00:00Z')
const DECLARED = new Date('2027-04-20T10:00:00Z')
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

beforeAll(async () => {
  ids.cong = (
    await testDb.congregation.create({ data: { name: `Lists ${ts}`, slug: `absence-lists-${ts}`, active: true } })
  ).id
  await withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    const dayOff = await tx.eventTemplate.create({ data: { name: 'Absence', key: 'day-off', congregationId } })
    ids.paul = (await tx.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })).id
    ids.paulAccount = (
      await tx.userAccount.create({
        data: { email: `paul-lists-${ts}@test.com`, password: 'x', memberId: ids.paul, congregationId },
      })
    ).id
    ids.samAccount = (
      await tx.userAccount.create({
        data: {
          email: `sam-lists-${ts}@test.com`,
          password: 'x',
          firstname: 'Sam',
          lastname: 'SANSFICHE',
          congregationId,
        },
      })
    ).id
    const row = (startDate: Date, endDate: Date, owner: { memberId: number | null; accountId: number }, extra = {}) =>
      tx.absence.create({ data: { startDate, endDate, createdAt: DECLARED, congregationId, ...owner, ...extra } })
    const paul = { memberId: ids.paul, accountId: ids.paulAccount }

    // A row only: shown everywhere.
    ids.paulRow = (await row(day('2027-05-10'), day('2027-05-12'), paul)).id
    ids.samRow = (await row(day('2027-05-20'), day('2027-05-21'), { memberId: null, accountId: ids.samAccount })).id
    // Written both ways, as createDayOff does.
    ids.dualEvent = (
      await tx.event.create({
        data: {
          name: 'Absence',
          startDate: day('2027-06-01'),
          endDate: day('2027-06-02'),
          status: 'released',
          templateId: dayOff.id,
          createdById: ids.paulAccount,
          congregationId,
        },
      })
    ).id
    ids.dualRow = (await row(day('2027-06-01'), day('2027-06-02'), paul, { legacyEventId: ids.dualEvent })).id
    // An event only, as an image from before the absences table writes during the rollout: no longer shown.
    await tx.event.create({
      data: {
        name: 'Absence',
        startDate: day('2027-05-15'),
        endDate: day('2027-05-16'),
        status: 'released',
        templateId: dayOff.id,
        createdById: ids.paulAccount,
        congregationId,
      },
    })
    // Over already: not among the ones to come.
    await row(day('2027-04-01'), day('2027-04-02'), paul)
    // Two other people, away in July (past the range the congregation's list is read over): Marie with a record, Léa
    // without one.
    const marie = (await tx.member.create({ data: { firstname: 'Marie', lastname: 'ROUX', congregationId } })).id
    const marieAccount = (
      await tx.userAccount.create({
        data: { email: `marie-lists-${ts}@test.com`, password: 'x', memberId: marie, congregationId },
      })
    ).id
    const leaAccount = (
      await tx.userAccount.create({ data: { email: `lea-lists-${ts}@test.com`, password: 'x', congregationId } })
    ).id
    ids.marieRow = (await row(day('2027-07-05'), day('2027-07-06'), { memberId: marie, accountId: marieAccount })).id
    ids.leaRow = (await row(day('2027-07-12'), day('2027-07-13'), { memberId: null, accountId: leaAccount })).id
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
    await testDb.auditLog.deleteMany({ where: { congregationId: ids.cong } })
    await testDb.congregation.deleteMany({ where: { id: ids.cong } })
  }
  await testDb.$disconnect()
})

const read = <T>(fn: (tx: Tx) => Promise<T>) => withScope(ids.cong, fn)

describe('the lists of absences and the absences table', () => {
  it('lists my absences to come by my record, or by my account when I have none', async () => {
    const paul = await read(tx =>
      listMyAbsences(tx, { accountId: ids.paulAccount, memberId: ids.paul, congregationId: ids.cong, now: NOW }),
    )
    const sam = await read(tx =>
      listMyAbsences(tx, { accountId: ids.samAccount, memberId: null, congregationId: ids.cong, now: NOW }),
    )

    expect(paul.map(absence => absence.id)).toEqual([ids.paulRow, ids.dualRow])
    expect(sam.map(absence => absence.id)).toEqual([ids.samRow])
  })

  it('lists the congregation’s absences with who is away and when they declared it', async () => {
    const rows = await read(tx =>
      listCongregationAbsences(tx, { congregationId: ids.cong, from: day('2027-05-01'), to: day('2027-06-30') }),
    )

    expect(
      rows.map(({ id, memberId, firstname, lastname, declaredAt }) => ({
        id,
        memberId,
        firstname,
        lastname,
        declaredAt,
      })),
    ).toEqual([
      { id: ids.paulRow, memberId: ids.paul, firstname: 'Paul', lastname: 'MARTIN', declaredAt: DECLARED },
      { id: ids.samRow, memberId: null, firstname: 'Sam', lastname: 'SANSFICHE', declaredAt: DECLARED },
      { id: ids.dualRow, memberId: ids.paul, firstname: 'Paul', lastname: 'MARTIN', declaredAt: DECLARED },
    ])
    expect(await read(tx => congregationHasAbsences(tx, ids.cong))).toBe(true)
  })

  it('gives the dashboard and the publisher record the absences to come', async () => {
    const dashboard = await read(tx => getNextDaysOffs(tx, ids.paulAccount, ids.cong, NOW))
    const record = await read(tx => findUpcomingAbsencesForMember(tx, ids.paul as never, ids.cong as never, NOW))
    const list = await read(tx => findNextAbsencesForMembers(tx, [ids.paul as never], ids.cong as never, NOW))

    expect(dashboard.map(absence => absence.id)).toEqual([ids.paulRow, ids.dualRow])
    expect(record.map(absence => absence.id)).toEqual([ids.paulRow, ids.dualRow])
    expect(list.get(ids.paul as never)).toEqual({ startDate: day('2027-05-10'), endDate: day('2027-05-12') })
  })

  it('gives the dashboard of an account without a record its own absences', async () => {
    const dashboard = await read(tx => getNextDaysOffs(tx, ids.samAccount, ids.cong, NOW))

    expect(dashboard.map(absence => absence.id)).toEqual([ids.samRow])
  })

  it('puts the absences in the calendar feed, keeping the identifier a subscriber already has', async () => {
    const items = await read(tx => getPersonalAssignments(tx, ids.paulAccount, ids.cong, day('2027-05-01')))
    const uids = items.filter(item => item.kind === 'day-off').map(item => item.uid)

    // Distinct ids, or the second identifier could not tell the event's id from the row's.
    expect(ids.dualEvent).not.toBe(ids.dualRow)
    expect(uids).toEqual([`absence-${ids.paulRow}`, `day-off-${ids.dualEvent}`])
  })

  it('deletes an absence by its row, and only the person’s own', async () => {
    const refused = await read(tx =>
      deleteDayOff(tx, { absenceId: ids.dualRow, accountId: ids.samAccount, memberId: null, congregationId: ids.cong }),
    )
    const deleted = await read(tx =>
      deleteDayOff(tx, {
        absenceId: ids.dualRow,
        accountId: ids.paulAccount,
        memberId: ids.paul,
        congregationId: ids.cong,
      }),
    )

    expect(refused).toBeNull()
    expect(deleted).toMatchObject({ startDate: day('2027-06-01'), endDate: day('2027-06-02') })
    expect(await read(tx => tx.absence.findFirst({ where: { id: ids.dualRow } }))).toBeNull()
  })

  it('refuses another person’s absence, whoever asks, and lets an account without a record delete its own', async () => {
    const del = (absenceId: number, accountId: number, memberId: number | null) =>
      read(tx => deleteDayOff(tx, { absenceId, accountId, memberId, congregationId: ids.cong }))

    // Without a record: not another such account's. With one: neither another record's nor a record-less one.
    expect(await del(ids.leaRow, ids.samAccount, null)).toBeNull()
    expect(await del(ids.marieRow, ids.paulAccount, ids.paul)).toBeNull()
    expect(await del(ids.samRow, ids.paulAccount, ids.paul)).toBeNull()
    expect(await del(ids.samRow, ids.samAccount, null)).toMatchObject({ startDate: day('2027-05-20') })
    // Asked twice, as from a second tab: the absence is already gone.
    expect(await del(ids.samRow, ids.samAccount, null)).toBeNull()

    const left = await read(tx =>
      tx.absence.findMany({ where: { id: { in: [ids.leaRow, ids.marieRow, ids.samRow] } }, select: { id: true } }),
    )
    expect(left.map(row => row.id).sort((a, b) => a - b)).toEqual([ids.marieRow, ids.leaRow].sort((a, b) => a - b))
  })

  // An absence is the person's: once the login it was declared from is deleted, it stays in every list, and a new
  // login given the record finds it in « Mes absences » and can cancel it.
  it('keeps a record’s absences in every list after its login is deleted, for a new login too', async () => {
    const start = day('2027-08-02')
    const end = day('2027-08-06')
    const { leon, firstLogin } = await read(async tx => {
      const leon = (
        await tx.member.create({ data: { firstname: 'Léon', lastname: 'BLANC', congregationId: ids.cong } })
      ).id
      const firstLogin = (
        await tx.userAccount.create({
          data: { email: `leon-1-${ts}@test.com`, password: 'x', memberId: leon, congregationId: ids.cong },
        })
      ).id
      await createDayOff(tx, firstLogin, leon, start, end, ids.cong)
      return { leon, firstLogin }
    })
    await read(async tx => {
      await releaseAccountEvents(tx, { id: firstLogin, memberId: leon }, ids.cong)
      await tx.userAccount.delete({ where: { id_congregationId: { id: firstLogin, congregationId: ids.cong } } })
    })
    const secondLogin = await read(
      async tx =>
        (
          await tx.userAccount.create({
            data: { email: `leon-2-${ts}@test.com`, password: 'x', memberId: leon, congregationId: ids.cong },
          })
        ).id,
    )

    const congregation = await read(tx =>
      listCongregationAbsences(tx, { congregationId: ids.cong, from: start, to: end }),
    )
    const mine = await read(tx =>
      listMyAbsences(tx, { accountId: secondLogin, memberId: leon, congregationId: ids.cong, now: NOW }),
    )
    expect(congregation.map(({ memberId, firstname }) => ({ memberId, firstname }))).toEqual([
      { memberId: leon, firstname: 'Léon' },
    ])
    expect(mine.map(({ startDate, endDate }) => ({ startDate, endDate }))).toEqual([{ startDate: start, endDate: end }])

    const cancelled = await read(tx =>
      deleteDayOff(tx, { absenceId: mine[0].id, accountId: secondLogin, memberId: leon, congregationId: ids.cong }),
    )
    expect(cancelled).toMatchObject({ startDate: start })
  })
})
