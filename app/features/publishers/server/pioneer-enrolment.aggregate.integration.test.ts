import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { openEnrolment } from './pioneer-enrolment.aggregate'

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
let memberId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Enrolment ${ts}`, slug: `enrolment-${ts}`, active: true },
  })
  congregationId = cong.id

  await withScope(congregationId, async tx => {
    const member = await tx.member.create({
      data: {
        firstname: 'Enrol',
        lastname: 'Pioneer',
        isPublisher: true,
        type: PublisherType.PionnierPermanant,
        baptismDate: new Date('2015-01-01'),
        congregationId,
      },
    })
    memberId = member.id
  })
})

afterAll(async () => {
  // audit() is fire-and-forget via unscopedDb — let those writes settle, then clear the AuditLog
  // rows (they FK the congregation) before the tenant is removed.
  await flushPendingAuditWrites()
  await withScope(congregationId, async tx => {
    await tx.pioneerEnrolment.deleteMany({ where: { congregationId } })
    await tx.member.deleteMany({ where: { congregationId } })
  })
  await testDb.auditLog.deleteMany({ where: { congregationId } })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

describe('pioneer-enrolment aggregate (integration)', () => {
  it('opens an ongoing stint and reads it back within the tenant scope', async () => {
    const created = await withScope(congregationId, tx =>
      openEnrolment(tx, memberId, congregationId, 1, {
        type: PublisherType.PionnierPermanant,
        startMonth: 8,
        startYear: 2025,
      }),
    )
    expect(created.endMonth).toBeNull()
    expect(created.endYear).toBeNull()

    const roundTrip = await withScope(congregationId, tx =>
      tx.pioneerEnrolment.findFirst({ where: { id: created.id, congregationId } }),
    )
    expect(roundTrip?.memberId).toBe(memberId)
    expect(roundTrip?.type).toBe(PublisherType.PionnierPermanant)
  })

  it('rejects a second stint overlapping the ongoing one at the DB layer', async () => {
    // The ongoing stint above runs from Sept 2025 onward, so a Jan 2026 single-month stint overlaps.
    await expect(
      withScope(congregationId, tx =>
        openEnrolment(tx, memberId, congregationId, 1, {
          type: PublisherType.PionnierAuxiliaires,
          startMonth: 0,
          startYear: 2026,
          endMonth: 0,
          endYear: 2026,
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('enforces the end_bounds_paired CHECK constraint on a raw unpaired insert', async () => {
    await expect(
      withScope(congregationId, tx =>
        tx.$executeRawUnsafe(
          `INSERT INTO "PioneerEnrolment" ("memberId", "type", "startMonth", "startYear", "endMonth", "endYear", "congregationId", "updatedAt")
           VALUES (${memberId}, 'pionnier-permanant', 5, 2027, 10, NULL, ${congregationId}, NOW())`,
        ),
      ),
    ).rejects.toThrow()
  })
})
