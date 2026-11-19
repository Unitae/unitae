import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// The absences of one person over a meeting, for the panel beside the list of people to pick from: the same table and
// the same overlap rule as the list itself, so the two never disagree.

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

const { listAbsencesOverRange } = await import('./absences.queries')

const ts = Date.now()
const ids = { cong: 0, paul: 0, account: 0 }
const START = new Date('2027-06-08T17:00:00Z')
const END = new Date('2027-06-08T19:00:00Z')

beforeAll(async () => {
  ids.cong = (
    await testDb.congregation.create({ data: { name: `Absences ${ts}`, slug: `absences-queries-${ts}`, active: true } })
  ).id
  await withScope(ids.cong, async tx => {
    const congregationId = ids.cong
    ids.paul = (await tx.member.create({ data: { firstname: 'Paul', lastname: 'MARTIN', congregationId } })).id
    ids.account = (
      await tx.userAccount.create({
        data: { email: `paul-queries-${ts}@test.com`, password: 'x', memberId: ids.paul, congregationId },
      })
    ).id
    const absence = (startDate: string, endDate: string) =>
      tx.absence.create({
        data: {
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          memberId: ids.paul,
          accountId: ids.account,
          congregationId,
        },
      })
    await absence('2027-06-07T00:00:00Z', '2027-06-08T17:00:00Z') // ends as the meeting starts: covers it
    await absence('2027-06-08T19:00:00Z', '2027-06-09T23:59:00Z') // starts as it ends: covers it
    await absence('2027-06-01T00:00:00Z', '2027-06-08T16:59:59Z') // ends a second before: does not
  })
})

afterAll(async () => {
  if (ids.cong) {
    await withScope(ids.cong, async tx => {
      await tx.absence.deleteMany({})
      await tx.userAccount.deleteMany({})
      await tx.member.deleteMany({})
    })
    await testDb.congregation.deleteMany({ where: { id: ids.cong } })
  }
  await testDb.$disconnect()
})

describe('listAbsencesOverRange', () => {
  it('gives the person’s absences touching the range, bounds included, in order', async () => {
    const rows = await withScope(ids.cong, tx => listAbsencesOverRange(tx, ids.paul, START, END, ids.cong))

    expect(rows.map(row => [row.startDate.toISOString(), row.endDate.toISOString()])).toEqual([
      ['2027-06-07T00:00:00.000Z', '2027-06-08T17:00:00.000Z'],
      ['2027-06-08T19:00:00.000Z', '2027-06-09T23:59:00.000Z'],
    ])
  })
})
