import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { backfillCongregationEnrolments, backfillMemberEnrolments } from './pioneer-enrolment-backfill.server'

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
let congId: number
let memberId: number

const PERM = PublisherType.PionnierPermanant
const AUX = PublisherType.PionnierAuxiliaires
const NORMAL = PublisherType.Normal

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Backfill ${ts}`, slug: `backfill-${ts}`, active: true },
  })
  congId = cong.id
  await withScope(congId, async tx => {
    const member = await tx.member.create({
      data: { firstname: 'Back', lastname: 'Fill', isPublisher: true, type: NORMAL, congregationId: congId },
    })
    memberId = member.id
    // Representative history: Permanent Sept–Oct 2025, a re-filed Oct (higher id wins, still Permanent),
    // then Auxiliary Dec 2025 (gap Nov). Member standing type Normal → monthly auxiliary, and the
    // permanent run is bounded (a different type follows).
    const rows = [
      { month: 8, year: 2025, type: PERM }, // Sept
      { month: 9, year: 2025, type: NORMAL }, // Oct (superseded)
      { month: 9, year: 2025, type: PERM }, // Oct re-file (wins)
      { month: 11, year: 2025, type: AUX }, // Dec auxiliary
    ]
    for (const r of rows) {
      await tx.publisherActivity.create({
        data: {
          month: r.month,
          year: r.year,
          type: r.type,
          isPublisher: true,
          publisherId: memberId,
          congregationId: congId,
        },
      })
    }
  })
})

afterAll(async () => {
  await flushPendingAuditWrites()
  await withScope(congId, async tx => {
    await tx.pioneerEnrolment.deleteMany({ where: { congregationId: congId } })
    await tx.publisherActivity.deleteMany({ where: { congregationId: congId } })
    await tx.member.deleteMany({ where: { congregationId: congId } })
  })
  await testDb.auditLog.deleteMany({ where: { congregationId: congId } })
  await testDb.congregation.delete({ where: { id: congId } })
  await testDb.$disconnect()
})

describe('backfillMemberEnrolments', () => {
  it('persists the derived stints through the aggregate', async () => {
    const written = await withScope(congId, tx =>
      backfillMemberEnrolments(tx, { id: memberId, type: NORMAL }, congId, 1),
    )
    expect(written).toBe(2)

    const stints = await testDb.pioneerEnrolment.findMany({
      where: { memberId },
      orderBy: [{ startYear: 'asc' }, { startMonth: 'asc' }],
    })
    expect(stints).toHaveLength(2)
    // Permanent Sept–Oct 2025, bounded (a different type follows).
    expect(stints[0]).toMatchObject({ type: PERM, startMonth: 8, startYear: 2025, endMonth: 9, endYear: 2025 })
    // Auxiliary Dec 2025, single-month (monthly auxiliary).
    expect(stints[1]).toMatchObject({ type: AUX, startMonth: 11, startYear: 2025, endMonth: 11, endYear: 2025 })
  })

  it('is idempotent — a re-run writes nothing', async () => {
    const written = await withScope(congId, tx =>
      backfillMemberEnrolments(tx, { id: memberId, type: NORMAL }, congId, 1),
    )
    expect(written).toBe(0)
    expect(await testDb.pioneerEnrolment.count({ where: { memberId } })).toBe(2)
  })
})

describe('backfillCongregationEnrolments', () => {
  it('skips members that already have enrolments (idempotent at the congregation level)', async () => {
    const result = await withScope(congId, tx => backfillCongregationEnrolments(tx, congId, 1))
    expect(result.members).toBe(1)
    expect(result.stints).toBe(0) // the member was already backfilled above
  })
})
