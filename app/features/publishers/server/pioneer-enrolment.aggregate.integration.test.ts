import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import { PublisherType } from '~/shared/types/publisher-type'
import {
  closeEnrolment,
  deleteEnrolment,
  openEnrolment,
  setEnrolmentGoal,
  updateEnrolment,
} from './pioneer-enrolment.aggregate'

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

  // A fresh member per test — the shared `memberId` already carries an ongoing stint that would
  // overlap everything.
  async function freshMember(name: string): Promise<number> {
    const m = await withScope(congregationId, tx =>
      tx.member.create({
        data: { firstname: name, lastname: 'Agg', isPublisher: true, type: PublisherType.Normal, congregationId },
      }),
    )
    return m.id
  }

  it('closeEnrolment sets the end and rejects an end before the start', async () => {
    const id = await freshMember('Close').then(mid =>
      withScope(congregationId, tx =>
        openEnrolment(tx, mid, congregationId, 1, {
          type: PublisherType.PionnierPermanant,
          startMonth: 8,
          startYear: 2025,
        }),
      ).then(e => e.id),
    )

    await expect(
      withScope(congregationId, tx => closeEnrolment(tx, id, congregationId, 1, { endMonth: 5, endYear: 2025 })),
    ).rejects.toBeInstanceOf(ConflictError)

    const closed = await withScope(congregationId, tx =>
      closeEnrolment(tx, id, congregationId, 1, { endMonth: 9, endYear: 2025 }),
    )
    expect(closed.endMonth).toBe(9)
    expect(closed.endYear).toBe(2025)
  })

  it('closeEnrolment throws NotFoundError for a missing enrolment', async () => {
    await expect(
      withScope(congregationId, tx => closeEnrolment(tx, 999_999, congregationId, 1, { endMonth: 9, endYear: 2025 })),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('updateEnrolment rejects a change that would overlap another of the member`s stints', async () => {
    const mid = await freshMember('Update')
    const first = await withScope(congregationId, tx =>
      openEnrolment(tx, mid, congregationId, 1, {
        type: PublisherType.PionnierPermanant,
        startMonth: 8,
        startYear: 2025,
        endMonth: 9,
        endYear: 2025,
      }),
    )
    await withScope(congregationId, tx =>
      openEnrolment(tx, mid, congregationId, 1, {
        type: PublisherType.PionnierPermanant,
        startMonth: 11,
        startYear: 2025,
        endMonth: 0,
        endYear: 2026,
      }),
    )

    // Move the first stint onto December, where the second stint already sits.
    await expect(
      withScope(congregationId, tx =>
        updateEnrolment(tx, first.id, congregationId, 1, {
          startMonth: 11,
          startYear: 2025,
          endMonth: 11,
          endYear: 2025,
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  // A period edit must not touch the goal. setEnrolmentGoal is the only way a goal changes, so a
  // caller correcting a start month has no reason to resend it — and silently wiping it would undo
  // the correction the manager made through the goal dialog.
  it('updateEnrolment preserves the goal when the caller does not supply one', async () => {
    const mid = await freshMember('GoalPreserve')
    const created = await withScope(congregationId, tx =>
      openEnrolment(tx, mid, congregationId, 1, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 4,
        startYear: 2026,
        endMonth: 4,
        endYear: 2026,
        monthlyGoal: 15,
      }),
    )

    const updated = await withScope(congregationId, tx =>
      updateEnrolment(tx, created.id, congregationId, 1, { startMonth: 5, startYear: 2026 }),
    )

    expect(updated.startMonth).toBe(5)
    expect(updated.monthlyGoal).toBe(15)
  })

  it('updateEnrolment still lets a caller change the goal explicitly', async () => {
    const mid = await freshMember('GoalExplicit')
    const created = await withScope(congregationId, tx =>
      openEnrolment(tx, mid, congregationId, 1, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 6,
        startYear: 2026,
        endMonth: 6,
        endYear: 2026,
        monthlyGoal: 15,
      }),
    )

    const updated = await withScope(congregationId, tx =>
      updateEnrolment(tx, created.id, congregationId, 1, { startMonth: 6, startYear: 2026, monthlyGoal: 30 }),
    )

    expect(updated.monthlyGoal).toBe(30)
  })

  it('setEnrolmentGoal corrects the goal without touching the period', async () => {
    const mid = await freshMember('Goal')
    const created = await withScope(congregationId, tx =>
      openEnrolment(tx, mid, congregationId, 1, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 4,
        startYear: 2026,
        endMonth: 4,
        endYear: 2026,
        monthlyGoal: 30,
      }),
    )

    const updated = await withScope(congregationId, tx => setEnrolmentGoal(tx, created.id, congregationId, 1, 15))

    expect(updated.monthlyGoal).toBe(15)
    // The period is the whole point of the narrow mutation — a goal fix must not shift the stint.
    expect(updated.startMonth).toBe(4)
    expect(updated.startYear).toBe(2026)
    expect(updated.endMonth).toBe(4)
    expect(updated.endYear).toBe(2026)
  })

  it('setEnrolmentGoal clears the goal so the enrolment falls back to the type rate', async () => {
    const mid = await freshMember('GoalClear')
    const created = await withScope(congregationId, tx =>
      openEnrolment(tx, mid, congregationId, 1, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 6,
        startYear: 2026,
        endMonth: 6,
        endYear: 2026,
        monthlyGoal: 30,
      }),
    )

    const updated = await withScope(congregationId, tx => setEnrolmentGoal(tx, created.id, congregationId, 1, null))

    expect(updated.monthlyGoal).toBeNull()
  })

  it('setEnrolmentGoal throws NotFoundError for a missing enrolment', async () => {
    await expect(
      withScope(congregationId, tx => setEnrolmentGoal(tx, 999_999, congregationId, 1, 15)),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('deleteEnrolment removes the row', async () => {
    const mid = await freshMember('Delete')
    const created = await withScope(congregationId, tx =>
      openEnrolment(tx, mid, congregationId, 1, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 2,
        startYear: 2026,
        endMonth: 2,
        endYear: 2026,
      }),
    )

    await withScope(congregationId, tx => deleteEnrolment(tx, created.id, congregationId, 1))

    const gone = await withScope(congregationId, tx =>
      tx.pioneerEnrolment.findFirst({ where: { id: created.id, congregationId } }),
    )
    expect(gone).toBeNull()
  })
})
