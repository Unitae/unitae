import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { PublisherType } from '~/shared/types/publisher-type'

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
const SY = 2025
const NOW = new Date(2026, 0, 15) // 15 Jan 2026 → Dec 2025 is the expected month
let congregationId: number
let memberId: number

const { getPioneerActivitySummary } = await import('./pioneer-activity.queries')

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Pioneer SY ${ts}`, slug: `pioneer-sy-${ts}`, active: true },
  })
  congregationId = cong.id

  await withScope(congregationId, async tx => {
    const member = await tx.member.create({
      data: {
        firstname: 'Reg',
        lastname: 'Pioneer',
        isPublisher: true,
        type: PublisherType.PionnierPermanant,
        baptismDate: new Date('2015-01-01'),
        congregationId,
      },
    })
    memberId = member.id

    const T = PublisherType.PionnierPermanant
    const rows = [
      { month: 7, year: 2025, hours: 99 }, // Aug 2025 → service year 2024, must be excluded
      { month: 8, year: 2025, hours: 50 }, // Sept 2025
      { month: 9, year: 2025, hours: 50 }, // Oct 2025 (will be superseded)
      { month: 9, year: 2025, hours: 10 }, // Oct 2025 re-filed (higher id → wins)
      { month: 0, year: 2026, hours: 50 }, // Jan 2026 → same service year (wrap)
      { month: 8, year: 2026, hours: 99 }, // Sept 2026 → service year 2026, must be excluded
    ]
    for (const r of rows) {
      await tx.publisherActivity.create({
        data: { ...r, type: T, isPublisher: true, publisherId: member.id, congregationId },
      })
    }
  })
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    await tx.publisherActivity.deleteMany({ where: { congregationId } })
    await tx.member.deleteMany({ where: { congregationId } })
  })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

describe('getPioneerActivitySummary (integration)', () => {
  it('applies the two-branch service-year predicate, dedups re-filed months, and flags the missing latest month', async () => {
    const result = await withScope(congregationId, tx => getPioneerActivitySummary(tx, congregationId, SY, NOW))

    const row = result.annual.find(r => r.memberId === memberId)
    expect(row).toBeDefined()
    // Sept + Oct(deduped to the 10h re-file) + Jan; Aug 2025 and Sept 2026 excluded by the predicate.
    expect(row?.pace.elapsedEnrolled).toBe(3)
    expect(row?.pace.actualToDate).toBe(110)
    // Dec 2025 is the expected month and was never filed → overdue.
    expect(row?.pace.reportingStatus).toBe('overdue')
  })
})
