import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { PublisherType } from '~/shared/types/publisher-type'

// The pioneer board lists who is a pioneer *right now*: a member with a PioneerEnrolment stint
// covering the current calendar month. This file proves the SQL "covers now" window
// (`currentEnrolmentWhere`) end-to-end — the arithmetic itself is unit-tested via `coversMonth` in
// the publishers model, but this checks the Prisma translation excludes future/past stints and that
// a one-month auxiliary (Member.type stays Normal) is surfaced with its enrolment type.

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
const now = new Date()
const curMonth = now.getMonth()
const curYear = now.getFullYear()
const nextMonth = (curMonth + 1) % 12
const nextYear = curMonth === 11 ? curYear + 1 : curYear
const prevMonth = (curMonth + 11) % 12
const prevYear = curMonth === 0 ? curYear - 1 : curYear

let congregationId: number
let ongoingId: number
let oneMonthAuxId: number
let futureId: number
let pastId: number
let anonymizedId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Pioneer Window ${ts}`, slug: `pioneer-window-${ts}`, active: true },
  })
  congregationId = cong.id

  await withScope(congregationId, async tx => {
    // Appearance is driven purely by the enrolment (covering month) + member lifecycle, never
    // Member.type — so every member keeps the default Normal type and only their stint differs.
    async function seedPioneer(firstname: string, anonymizedAt: Date | null = null): Promise<number> {
      const member = await tx.member.create({
        data: {
          firstname,
          lastname: 'Window',
          isPublisher: true,
          baptismDate: new Date('2010-01-01'),
          anonymizedAt,
          congregationId,
        },
      })
      return member.id
    }

    ongoingId = await seedPioneer('Ongoing')
    oneMonthAuxId = await seedPioneer('OneMonthAux')
    futureId = await seedPioneer('Future')
    pastId = await seedPioneer('Past')
    anonymizedId = await seedPioneer('Anon', new Date())

    // Ongoing standing stint started years ago → covers now.
    await tx.pioneerEnrolment.create({
      data: {
        memberId: ongoingId,
        type: PublisherType.PionnierPermanant,
        startMonth: 0,
        startYear: 2020,
        congregationId,
      },
    })
    // One-month auxiliary: start == end == the current month → covers now, section = auxiliary.
    await tx.pioneerEnrolment.create({
      data: {
        memberId: oneMonthAuxId,
        type: PublisherType.PionnierAuxiliaires,
        startMonth: curMonth,
        startYear: curYear,
        endMonth: curMonth,
        endYear: curYear,
        congregationId,
      },
    })
    // Starts next month → NOT current yet.
    await tx.pioneerEnrolment.create({
      data: {
        memberId: futureId,
        type: PublisherType.PionnierPermanant,
        startMonth: nextMonth,
        startYear: nextYear,
        congregationId,
      },
    })
    // Ended last month → no longer current.
    await tx.pioneerEnrolment.create({
      data: {
        memberId: pastId,
        type: PublisherType.PionnierPermanant,
        startMonth: 0,
        startYear: 2020,
        endMonth: prevMonth,
        endYear: prevYear,
        congregationId,
      },
    })
    // Covers now, but the member is anonymized → filtered by the member lifecycle guard.
    await tx.pioneerEnrolment.create({
      data: {
        memberId: anonymizedId,
        type: PublisherType.PionnierPermanant,
        startMonth: 0,
        startYear: 2020,
        congregationId,
      },
    })
  })
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    // PioneerEnrolment cascades on member delete (required relation).
    await tx.member.deleteMany({ where: { congregationId } })
  })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

const { getDynamicDocumentData, getDynamicPreview } = await import('./dynamic-documents.server')

describe('pioneer board time window (integration)', () => {
  it('shows only members whose stint covers the current month, with the enrolment type', async () => {
    const result = await withScope(congregationId, tx => getDynamicDocumentData(tx, 'pioneers', null, congregationId))

    expect(result?.type).toBe('pioneers')
    if (result?.type !== 'pioneers') throw new Error('expected pioneers payload')

    const ids = result.pioneers.map(p => p.id)
    expect(ids).toContain(ongoingId)
    expect(ids).toContain(oneMonthAuxId)
    expect(ids).not.toContain(futureId)
    expect(ids).not.toContain(pastId)
    expect(ids).not.toContain(anonymizedId)

    // The one-month auxiliary carries its enrolment type even though Member.type is Normal,
    // and auxiliaries sort ahead of standing pioneers.
    const aux = result.pioneers.find(p => p.id === oneMonthAuxId)
    expect(aux?.type).toBe(PublisherType.PionnierAuxiliaires)
    expect(result.pioneers[0].id).toBe(oneMonthAuxId)
  })

  it('counts only current pioneers in the preview', async () => {
    const result = await withScope(congregationId, tx => getDynamicPreview(tx, 'pioneers', null, congregationId))

    // Ongoing + one-month auxiliary — future, past, and anonymized are all excluded.
    expect(result).toBe('2 pionniers')
  })
})
