import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
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
let congregationId: number
let actorAccountId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Auto Flow ${ts}`, slug: `auto-flow-${ts}`, active: true },
  })
  congregationId = cong.id

  await withScope(congregationId, async tx => {
    const member = await tx.member.create({
      data: { firstname: 'Actor', lastname: 'Manager', isPublisher: true, congregationId },
    })
    const account = await tx.userAccount.create({
      data: {
        email: `actor-auto-flow-${ts}@test.com`,
        password: 'hashed',
        active: true,
        memberId: member.id,
        congregationId,
      },
    })
    actorAccountId = account.id
  })
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    await tx.publisherActivity.deleteMany({ where: { congregationId } })
    await tx.userAccount.deleteMany({ where: { congregationId } })
    await tx.member.deleteMany({ where: { congregationId } })
  })
  await flushPendingAuditWrites()
  await testDb.auditLog.deleteMany({ where: { congregationId } })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

const { createPublisherActivity } = await import('./publisher-activity-mutations.server')

const SIX_MONTHS = [
  { month: 8, year: 2025 },
  { month: 9, year: 2025 },
  { month: 10, year: 2025 },
  { month: 11, year: 2025 },
  { month: 0, year: 2026 },
  { month: 1, year: 2026 },
]

describe('publisher activity mutations → evaluator (integration)', () => {
  it('auto-flags inactive after 6 consecutive missed-preach reports and clears it on the next hours report', async () => {
    const publisher = await withScope(congregationId, tx =>
      tx.member.create({
        data: { firstname: 'Subject', lastname: `Streak ${ts}`, isPublisher: true, congregationId },
      }),
    )

    // File the first 5 missed-preach reports — should NOT flip yet.
    for (const slot of SIX_MONTHS.slice(0, 5)) {
      await withScope(congregationId, db =>
        createPublisherActivity(db, {
          publisherId: publisher.id,
          month: slot.month,
          year: slot.year,
          type: PublisherType.Normal,
          isPublisher: false,
          hours: 0,
          studies: 0,
          notes: '',
          congregationId,
          actorId: actorAccountId,
        }),
      )
    }

    const after5 = await withScope(congregationId, tx => tx.member.findUniqueOrThrow({ where: { id: publisher.id } }))
    expect(after5.inactiveAt).toBeNull()

    // 6th missed-preach report — auto-set fires.
    const sixth = SIX_MONTHS[5]
    await withScope(congregationId, db =>
      createPublisherActivity(db, {
        publisherId: publisher.id,
        month: sixth.month,
        year: sixth.year,
        type: PublisherType.Normal,
        isPublisher: false,
        hours: 0,
        studies: 0,
        notes: '',
        congregationId,
        actorId: actorAccountId,
      }),
    )

    const after6 = await withScope(congregationId, tx => tx.member.findUniqueOrThrow({ where: { id: publisher.id } }))
    expect(after6.inactiveAt).toBeInstanceOf(Date)

    // Hours report arrives — auto-clear fires silently.
    await withScope(congregationId, db =>
      createPublisherActivity(db, {
        publisherId: publisher.id,
        month: 2,
        year: 2026,
        type: PublisherType.Normal,
        isPublisher: true,
        hours: 4,
        studies: 1,
        notes: '',
        congregationId,
        actorId: actorAccountId,
      }),
    )

    const afterHours = await withScope(congregationId, tx =>
      tx.member.findUniqueOrThrow({ where: { id: publisher.id } }),
    )
    expect(afterHours.inactiveAt).toBeNull()
  })

  it('does not flip a publisher with mixed reports (only 5 of 6 are missed)', async () => {
    const publisher = await withScope(congregationId, tx =>
      tx.member.create({
        data: { firstname: 'Mixed', lastname: `Streak ${ts}`, isPublisher: true, congregationId },
      }),
    )

    // 5 missed + 1 preached among the latest 6 → no flip.
    for (let i = 0; i < 5; i++) {
      const slot = SIX_MONTHS[i]
      await withScope(congregationId, db =>
        createPublisherActivity(db, {
          publisherId: publisher.id,
          month: slot.month,
          year: slot.year,
          type: PublisherType.Normal,
          isPublisher: false,
          hours: 0,
          studies: 0,
          notes: '',
          congregationId,
          actorId: actorAccountId,
        }),
      )
    }

    const preachedSlot = SIX_MONTHS[5]
    await withScope(congregationId, db =>
      createPublisherActivity(db, {
        publisherId: publisher.id,
        month: preachedSlot.month,
        year: preachedSlot.year,
        type: PublisherType.Normal,
        isPublisher: true,
        hours: 2,
        studies: 0,
        notes: '',
        congregationId,
        actorId: actorAccountId,
      }),
    )

    const result = await withScope(congregationId, tx => tx.member.findUniqueOrThrow({ where: { id: publisher.id } }))
    expect(result.inactiveAt).toBeNull()
  })
})
