import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { PublisherType } from '~/shared/types/publisher-type'
import type { EnrolmentPeriod } from '../model/pioneer-enrolment'
import {
  getEnrolmentsForMember,
  getEnrolmentsForServiceYear,
  resolveEnrolmentMonthlyGoal,
} from './pioneer-enrolment.queries'

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
const SY = 2025 // Sept 2025 … Aug 2026
let congId: number
let memberId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({ data: { name: `EnrolQ ${ts}`, slug: `enrol-q-${ts}`, active: true } })
  congId = cong.id
  await withScope(congId, async tx => {
    const member = await tx.member.create({
      data: { firstname: 'Q', lastname: 'Uery', isPublisher: true, type: PublisherType.Normal, congregationId: congId },
    })
    memberId = member.id
    // Two stints for this member: an annual one inside SY 2025, and one entirely in a prior SY.
    await tx.pioneerEnrolment.create({
      data: {
        memberId,
        congregationId: congId,
        type: PublisherType.PionnierPermanant,
        startMonth: 8,
        startYear: 2025,
        endMonth: 1,
        endYear: 2026,
      },
    })
    await tx.pioneerEnrolment.create({
      data: {
        memberId,
        congregationId: congId,
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 8,
        startYear: 2023,
        endMonth: 9,
        endYear: 2023,
      },
    })
  })
})

afterAll(async () => {
  await withScope(congId, async tx => {
    await tx.pioneerEnrolment.deleteMany({ where: { congregationId: congId } })
    await tx.member.deleteMany({ where: { congregationId: congId } })
  })
  await testDb.congregation.delete({ where: { id: congId } })
  await testDb.$disconnect()
})

describe('getEnrolmentsForMember', () => {
  it('returns all of a member`s stints oldest first', async () => {
    const rows = await withScope(congId, tx => getEnrolmentsForMember(tx, memberId, congId))
    expect(rows).toHaveLength(2)
    expect(rows[0].startYear).toBe(2023) // oldest first
    expect(rows[1].startYear).toBe(2025)
  })
})

describe('getEnrolmentsForServiceYear', () => {
  it('returns only stints intersecting the service year', async () => {
    const rows = await withScope(congId, tx => getEnrolmentsForServiceYear(tx, SY))
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe(PublisherType.PionnierPermanant)
  })
})

describe('resolveEnrolmentMonthlyGoal', () => {
  const auxOngoing: EnrolmentPeriod = {
    type: PublisherType.PionnierAuxiliaires,
    startMonth: 8,
    startYear: 2025,
    endMonth: null,
    endYear: null,
    monthlyGoal: null,
  }

  it('falls back to the type default when no per-person goal is set', async () => {
    const goal = await withScope(congId, tx => resolveEnrolmentMonthlyGoal(tx, auxOngoing, SY))
    expect(goal).toBe(30) // DEFAULT_MONTHLY_GOALS auxiliary
  })

  it('uses the per-person goal when set', async () => {
    const goal = await withScope(congId, tx => resolveEnrolmentMonthlyGoal(tx, { ...auxOngoing, monthlyGoal: 15 }, SY))
    expect(goal).toBe(15)
  })
})
