import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { flushPendingAuditWrites } from '~/shared/domain/audit.server'
import { PublisherType } from '~/shared/types/publisher-type'
import {
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
        type: PublisherType.Normal,
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

describe('pioneer-enrolment workflow (integration)', () => {
  it('an ongoing ANNUAL enrol sets Member.type and attaches the pioneer role', async () => {
    const memberId = await makePublisher(`Annual-${ts}`)
    await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, { type: PublisherType.PionnierPermanant, startMonth: 8, startYear: 2025 }),
    )
    const after = await testDb.member.findUniqueOrThrow({ where: { id: memberId } })
    expect(after.type).toBe(PublisherType.PionnierPermanant)
    expect(await pioneerRoleAttached(memberId)).toBe(true)
  })

  it('an ongoing PERMANENT-AUXILIARY enrol sets Member.type to PionnierAuxiliaires', async () => {
    const memberId = await makePublisher(`PermAux-${ts}`)
    await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: 8,
        startYear: 2025,
      }),
    )
    const after = await testDb.member.findUniqueOrThrow({ where: { id: memberId } })
    expect(after.type).toBe(PublisherType.PionnierAuxiliaires)
    expect(await pioneerRoleAttached(memberId)).toBe(true)
  })

  it('a SINGLE-MONTH auxiliary enrol leaves Member.type as Normal', async () => {
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
    const after = await testDb.member.findUniqueOrThrow({ where: { id: memberId } })
    expect(after.type).toBe(PublisherType.Normal)
    expect(await pioneerRoleAttached(memberId)).toBe(false)
    // The enrolment record still exists (status is read from it, not from Member.type).
    const enrolments = await testDb.pioneerEnrolment.findMany({ where: { memberId } })
    expect(enrolments).toHaveLength(1)
    expect(enrolments[0].monthlyGoal).toBe(15)
  })

  it('closing the last ongoing stint reverts Member.type to Normal', async () => {
    const memberId = await makePublisher(`Close-${ts}`)
    const enrolment = await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, { type: PublisherType.PionnierPermanant, startMonth: 8, startYear: 2025 }),
    )
    expect((await testDb.member.findUniqueOrThrow({ where: { id: memberId } })).type).toBe(
      PublisherType.PionnierPermanant,
    )

    await withScope(congId, tx => endPioneerEnrolment(tx, enrolment.id, congId, 1, { endMonth: 1, endYear: 2026 }))

    const after = await testDb.member.findUniqueOrThrow({ where: { id: memberId } })
    expect(after.type).toBe(PublisherType.Normal)
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
    expect((await testDb.member.findUniqueOrThrow({ where: { id: memberId } })).type).toBe(PublisherType.Normal)
  })

  it('removing the last ongoing stint reverts Member.type to Normal', async () => {
    const memberId = await makePublisher(`RemoveStanding-${ts}`)
    const enrolment = await withScope(congId, tx =>
      enrolPioneer(tx, memberId, congId, 1, { type: PublisherType.PionnierPermanant, startMonth: 8, startYear: 2025 }),
    )
    expect((await testDb.member.findUniqueOrThrow({ where: { id: memberId } })).type).toBe(
      PublisherType.PionnierPermanant,
    )

    await withScope(congId, tx => removePioneerEnrolment(tx, enrolment.id, congId, 1))

    const after = await testDb.member.findUniqueOrThrow({ where: { id: memberId } })
    expect(after.type).toBe(PublisherType.Normal)
    expect(await pioneerRoleAttached(memberId)).toBe(false)
  })

  // A period edit can flip a stint's shape, which is exactly what the Member.type cache keys on.
  // These three are the cases updateEnrolment could not previously be trusted with.
  it('adding an end date to the only ongoing stint reverts Member.type and detaches the role', async () => {
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

    const member = await testDb.member.findUniqueOrThrow({ where: { id: memberId } })
    expect(member.type).toBe(PublisherType.Normal)
    expect(await pioneerRoleAttached(memberId)).toBe(false)
  })

  it('clearing the end date reopens the stint and restores Member.type', async () => {
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

    const member = await testDb.member.findUniqueOrThrow({ where: { id: memberId } })
    expect(member.type).toBe(PublisherType.PionnierSpecial)
    expect(await pioneerRoleAttached(memberId)).toBe(true)
  })

  it('correcting an ongoing stint`s type moves Member.type with it', async () => {
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

    const member = await testDb.member.findUniqueOrThrow({ where: { id: memberId } })
    expect(member.type).toBe(PublisherType.Missionnaire)
  })
})
