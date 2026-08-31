import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { standingTypeFromEnrolments } from '../model/pioneer-enrolment'
import {
  endOngoingEnrolmentsOfType,
  endPioneerEnrolment,
  enrolPioneer,
  removePioneerEnrolment,
  updatePioneerEnrolment,
} from './pioneer-enrolment.workflow'

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

const { seedBuiltInRoles } = await import('~/shared/domain/setup.server')

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Enrol WF ${ts}`, slug: `enrol-wf-${ts}`, active: true },
  })
  congId = cong.id
  await withScope(congId, tx => seedBuiltInRoles(tx, congId))
})

afterAll(async () => {
  await flushPendingAuditWrites()
  await withScope(congId, async tx => {
    await tx.pioneerEnrolment.deleteMany({ where: { congregationId: congId } })
    await tx.memberRoleAssignment.deleteMany({})
    await tx.member.deleteMany({ where: { congregationId: congId } })
  })
  await testDb.auditLog.deleteMany({ where: { congregationId: congId } })
  await testDb.congregation.delete({ where: { id: congId } })
  await testDb.$disconnect()
})

async function makePublisher(name: string): Promise<number> {
  const member = await withScope(congId, tx =>
    tx.member.create({
      data: {
        firstname: name,
        lastname: 'Test',
        isPublisher: true,
        baptismDate: new Date('2010-01-01'),
        congregationId: congId,
      },
    }),
  )
  await withScope(congId, tx => seedBuiltInRoles(tx, congId)) // idempotent
  return member.id
}

async function pioneerRoleAttached(memberId: number): Promise<boolean> {
  const role = await testDb.role.findFirstOrThrow({ where: { key: 'pioneer', congregationId: congId } })
  const assignment = await testDb.memberRoleAssignment.findFirst({ where: { memberId, roleId: role.id } })
  return assignment !== null
}

// The member's standing status now lives only in their stints — read it the way production does.
async function standingTypeOf(memberId: number): Promise<PublisherType> {
  const stints = await testDb.pioneerEnrolment.findMany({ where: { memberId } })
  return standingTypeFromEnrolments(stints)
}

describe('pioneer-enrolment workflow (integration)', () => {
  it('an ongoing ANNUAL enrol gives the member a standing status and attaches the pioneer role', async () => {
    const memberId = await makePublisher(`Annual-${ts}`)
    await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, { type: PublisherType.PionnierPermanant, startMonth: 8, startYear: 2025 }),
    )
    expect(await standingTypeOf(memberId)).toBe(PublisherType.PionnierPermanant)
    expect(await pioneerRoleAttached(memberId)).toBe(true)
  })

  it('an ongoing PERMANENT-AUXILIARY enrol makes the standing status PionnierAuxiliaires', async () => {
    const memberId = await makePublisher(`PermAux-${ts}`)
    await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 8,
        startYear: 2025,
      }),
    )
    expect(await standingTypeOf(memberId)).toBe(PublisherType.PionnierAuxiliaires)
    expect(await pioneerRoleAttached(memberId)).toBe(true)
  })

  it('a SINGLE-MONTH auxiliary enrol leaves the standing status Normal', async () => {
    const memberId = await makePublisher(`Monthly-${ts}`)
    await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 2,
        startYear: 2026,
        endMonth: 2,
        endYear: 2026,
        monthlyGoal: 15,
      }),
    )
    expect(await standingTypeOf(memberId)).toBe(PublisherType.Normal)
    expect(await pioneerRoleAttached(memberId)).toBe(false)
    // The enrolment record still exists — the standing status is read from it.
    const enrolments = await testDb.pioneerEnrolment.findMany({ where: { memberId } })
    expect(enrolments).toHaveLength(1)
    expect(enrolments[0].monthlyGoal).toBe(15)
  })

  it('closing the last ongoing stint returns the standing status to Normal', async () => {
    const memberId = await makePublisher(`Close-${ts}`)
    const enrolment = await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, { type: PublisherType.PionnierPermanant, startMonth: 8, startYear: 2025 }),
    )
    expect(await standingTypeOf(memberId)).toBe(PublisherType.PionnierPermanant)

    await withScope(congId, tx => endPioneerEnrolment(tx, enrolment.id, congId, 1, { endMonth: 1, endYear: 2026 }))

    expect(await standingTypeOf(memberId)).toBe(PublisherType.Normal)
    expect(await pioneerRoleAttached(memberId)).toBe(false)
  })

  it('removing a single-month auxiliary deletes it and leaves the type untouched', async () => {
    const memberId = await makePublisher(`RemoveAux-${ts}`)
    const enrolment = await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 2,
        startYear: 2026,
        endMonth: 2,
        endYear: 2026,
        monthlyGoal: 15,
      }),
    )

    await withScope(congId, tx => removePioneerEnrolment(tx, enrolment.id, congId, 1))

    expect(await testDb.pioneerEnrolment.count({ where: { id: enrolment.id } })).toBe(0)
    expect(await standingTypeOf(memberId)).toBe(PublisherType.Normal)
  })

  it('removing the last ongoing stint returns the standing status to Normal', async () => {
    const memberId = await makePublisher(`RemoveStanding-${ts}`)
    const enrolment = await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, { type: PublisherType.PionnierPermanant, startMonth: 8, startYear: 2025 }),
    )
    expect(await standingTypeOf(memberId)).toBe(PublisherType.PionnierPermanant)

    await withScope(congId, tx => removePioneerEnrolment(tx, enrolment.id, congId, 1))

    expect(await standingTypeOf(memberId)).toBe(PublisherType.Normal)
    expect(await pioneerRoleAttached(memberId)).toBe(false)
  })

  // A period edit can flip a stint's shape, which is what the member's standing status turns on.
  // These three are the cases updateEnrolment could not previously be trusted with.
  it('adding an end date to the only ongoing stint drops the standing status and detaches the role', async () => {
    const memberId = await makePublisher(`UpdateClose-${ts}`)
    const enrolment = await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, {
        type: PublisherType.PionnierPermanant,
        startMonth: 8,
        startYear: 2025,
      }),
    )
    expect(await pioneerRoleAttached(memberId)).toBe(true)

    await withScope(congId, tx =>
      updatePioneerEnrolment(tx, enrolment.id, congId, 1, {
        startMonth: 8,
        startYear: 2025,
        endMonth: 10,
        endYear: 2025,
      }),
    )

    expect(await standingTypeOf(memberId)).toBe(PublisherType.Normal)
    expect(await pioneerRoleAttached(memberId)).toBe(false)
  })

  it('clearing the end date reopens the stint and restores the standing status', async () => {
    const memberId = await makePublisher(`UpdateReopen-${ts}`)
    const enrolment = await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, {
        type: PublisherType.PionnierSpecial,
        startMonth: 8,
        startYear: 2025,
        endMonth: 10,
        endYear: 2025,
      }),
    )
    expect(await pioneerRoleAttached(memberId)).toBe(false)

    await withScope(congId, tx =>
      updatePioneerEnrolment(tx, enrolment.id, congId, 1, { startMonth: 8, startYear: 2025 }),
    )

    expect(await standingTypeOf(memberId)).toBe(PublisherType.PionnierSpecial)
    expect(await pioneerRoleAttached(memberId)).toBe(true)
  })

  it('correcting an ongoing stint`s type moves the standing status with it', async () => {
    const memberId = await makePublisher(`UpdateType-${ts}`)
    const enrolment = await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, {
        type: PublisherType.PionnierPermanant,
        startMonth: 8,
        startYear: 2025,
      }),
    )

    await withScope(congId, tx =>
      updatePioneerEnrolment(tx, enrolment.id, congId, 1, {
        type: PublisherType.Missionnaire,
        startMonth: 8,
        startYear: 2025,
      }),
    )

    expect(await standingTypeOf(memberId)).toBe(PublisherType.Missionnaire)
  })

  // Replaces the old bulkUpdateType: turning off the permanent-auxiliary profile used to flip the
  // cached column, which left the ongoing stints open and contradicting it. Closing the stints is
  // the same intent expressed against the source of truth.
  it('endOngoingEnrolmentsOfType closes ongoing stints of that type and drops the role', async () => {
    const memberId = await makePublisher(`BulkAux-${ts}`)
    await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 8,
        startYear: 2025,
      }),
    )
    expect(await pioneerRoleAttached(memberId)).toBe(true)

    await withScope(congId, tx =>
      endOngoingEnrolmentsOfType(tx, congId, 1, PublisherType.PionnierAuxiliaires, { endMonth: 10, endYear: 2025 }),
    )

    const stints = await testDb.pioneerEnrolment.findMany({ where: { memberId, congregationId: congId } })
    expect(stints).toHaveLength(1)
    expect(stints[0].endMonth).toBe(10)
    expect(stints[0].endYear).toBe(2025)
    expect(await pioneerRoleAttached(memberId)).toBe(false)
  })

  it('endOngoingEnrolmentsOfType leaves other pioneer types alone', async () => {
    const memberId = await makePublisher(`BulkPerm-${ts}`)
    await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, {
        type: PublisherType.PionnierPermanant,
        startMonth: 8,
        startYear: 2025,
      }),
    )

    await withScope(congId, tx =>
      endOngoingEnrolmentsOfType(tx, congId, 1, PublisherType.PionnierAuxiliaires, { endMonth: 10, endYear: 2025 }),
    )

    const stints = await testDb.pioneerEnrolment.findMany({ where: { memberId, congregationId: congId } })
    expect(stints[0].endMonth).toBeNull()
    expect(await pioneerRoleAttached(memberId)).toBe(true)
  })

  // A single-month auxiliary is already closed, so it is not "ongoing" and must not be re-dated.
  it('endOngoingEnrolmentsOfType does not touch an already-closed single-month auxiliary', async () => {
    const memberId = await makePublisher(`BulkMonthly-${ts}`)
    await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 3,
        startYear: 2026,
        endMonth: 3,
        endYear: 2026,
        monthlyGoal: 30,
      }),
    )

    await withScope(congId, tx =>
      endOngoingEnrolmentsOfType(tx, congId, 1, PublisherType.PionnierAuxiliaires, { endMonth: 10, endYear: 2025 }),
    )

    const stints = await testDb.pioneerEnrolment.findMany({ where: { memberId, congregationId: congId } })
    expect(stints[0].endMonth).toBe(3)
    expect(stints[0].endYear).toBe(2026)
  })

  // The create form offers start years from -2 to +2, so an appointment can be dated ahead. Closing
  // it at the current month would be `end < start`, which closeEnrolment rejects — and the throw
  // would take the whole settings save with it, not just this stint.
  it('endOngoingEnrolmentsOfType leaves a future-dated stint alone instead of failing', async () => {
    const future = await makePublisher(`BulkFuture-${ts}`)
    const current = await makePublisher(`BulkCurrent-${ts}`)
    await withScope(congId, tx =>
      enrolPioneer(tx, future, congId, 1, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 5,
        startYear: 2027,
      }),
    )
    await withScope(congId, tx =>
      enrolPioneer(tx, current, congId, 1, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 8,
        startYear: 2025,
      }),
    )

    await withScope(congId, tx =>
      endOngoingEnrolmentsOfType(tx, congId, 1, PublisherType.PionnierAuxiliaires, { endMonth: 10, endYear: 2025 }),
    )

    // The one that had started is closed; the future one is untouched and still ongoing.
    const closed = await testDb.pioneerEnrolment.findFirst({ where: { memberId: current, congregationId: congId } })
    expect(closed?.endMonth).toBe(10)
    const untouched = await testDb.pioneerEnrolment.findFirst({ where: { memberId: future, congregationId: congId } })
    expect(untouched?.endMonth).toBeNull()
  })

  // Each affected member is synced once, not once per stint — exercised across members, since the
  // non-overlap invariant means one member can never hold two ongoing stints.
  it('endOngoingEnrolmentsOfType closes stints for several members', async () => {
    const a = await makePublisher(`BulkA-${ts}`)
    const b = await makePublisher(`BulkB-${ts}`)
    for (const id of [a, b]) {
      await withScope(congId, tx =>
        enrolPioneer(tx, id, congId, 1, {
          type: PublisherType.PionnierAuxiliaires,
          startMonth: 8,
          startYear: 2025,
        }),
      )
    }

    const closed = await withScope(congId, tx =>
      endOngoingEnrolmentsOfType(tx, congId, 1, PublisherType.PionnierAuxiliaires, { endMonth: 10, endYear: 2025 }),
    )

    expect(closed).toEqual({ closed: 2, skippedFutureDated: expect.any(Number) })
    expect(await pioneerRoleAttached(a)).toBe(false)
    expect(await pioneerRoleAttached(b)).toBe(false)
  })
})
