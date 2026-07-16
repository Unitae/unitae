// Integration pins for the "manager sees the conflict when a publisher adds
// an absence on a draft-event date" flow. Reproduces the exact sequence a
// user reported as broken:
//   1. Manager creates a draft event with an assignee.
//   2. Assignee creates an absence overlapping the event.
//   3. Manager expects (a) the assignment's hasConflict flag to flip, and
//      (b) releaseEvent to block until they resolve it.
//
// Each `it` block creates its own scoped congregation so tests are
// order-independent (per CLAUDE.md: "each test sets up its own state").

import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { createDayOff } from '~/features/events/server/days-off.server'
import { releaseEvent } from '~/features/events/server/event-status.server'
import { refreshConflictFlags } from '~/features/events/server/programme-assignments.server'

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

const suiteTs = Date.now()
const createdCongIds: number[] = []

// Provisions a fresh congregation with the fixtures each test needs. Returns
// the ids so the caller can drive the assertion. The suffix keeps emails /
// slugs unique across parallel test invocations.
async function provisionCongregation(suffix: string) {
  const ts = `${suiteTs}-${suffix}`
  const cong = await testDb.congregation.create({
    data: { name: `DraftConflict ${ts}`, slug: `draft-conflict-${ts}`, active: true },
  })
  createdCongIds.push(cong.id)

  return withScope(cong.id, async tx => {
    // Off is the sentinel absence kind. We do NOT create a meeting kind — the
    // event is left with `kindId: null`, mirroring the seeded-template case
    // that surfaced the bug (Prisma's inner-join filter would silently drop
    // null-kind events from the refresh loop).
    await tx.eventKind.create({
      data: { name: 'Off', key: 'off', color: '#888888', congregationId: cong.id },
    })

    const manager = await tx.userAccount.create({
      data: {
        email: `manager-${ts}@test.com`,
        password: 'hashed',
        active: true,
        congregationId: cong.id,
      },
    })

    const bobMember = await tx.member.create({
      data: { firstname: 'Bob', lastname: `Test-${ts}`, isPublisher: true, congregationId: cong.id },
    })
    const bob = await tx.userAccount.create({
      data: {
        email: `bob-${ts}@test.com`,
        password: 'hashed',
        active: true,
        memberId: bobMember.id,
        congregationId: cong.id,
      },
    })

    const event = await tx.event.create({
      data: {
        name: `Draft Event ${ts}`,
        startDate: new Date('2027-08-10T19:00:00Z'),
        endDate: new Date('2027-08-10T21:00:00Z'),
        createdById: manager.id,
        congregationId: cong.id,
        status: 'draft',
      },
    })

    const part = await tx.programmePartAssignment.create({
      data: {
        eventId: event.id,
        assigneeId: bobMember.id,
        name: 'Discours',
        section: 'main',
        order: 1,
        hasConflict: false,
        congregationId: cong.id,
      },
    })

    return {
      congId: cong.id,
      managerAccountId: manager.id,
      bobAccountId: bob.id,
      bobMemberId: bobMember.id,
      draftEventId: event.id,
      partAssignmentId: part.id,
    }
  })
}

// FK-safe teardown for every congregation this suite touched, no matter
// which describe block created it.
afterAll(async () => {
  for (const congId of createdCongIds) {
    await testDb.programmePartAssignment.deleteMany({ where: { congregationId: congId } })
    await testDb.event.deleteMany({ where: { congregationId: congId } })
    await testDb.eventKind.deleteMany({ where: { congregationId: congId } })
    await testDb.userAccount.deleteMany({ where: { congregationId: congId } })
    await testDb.member.deleteMany({ where: { congregationId: congId } })
    await testDb.congregation.delete({ where: { id: congId } })
  }
  await testDb.$disconnect()
})

describe('refreshConflictFlags co-participant preservation (integration)', () => {
  it('keeps hasConflict=true on a shared part when only one participant has cleared their absence', async () => {
    const { congId, bobAccountId, bobMemberId, partAssignmentId } = await provisionCongregation('coparticipant')

    // Extra fixture: Alice (an additional Member) also on the same part.
    const aliceId = await withScope(congId, async tx => {
      const alice = await tx.member.create({
        data: { firstname: 'Alice', lastname: `Test-${congId}`, isPublisher: true, congregationId: congId },
      })
      await tx.userAccount.create({
        data: {
          email: `alice-${congId}@test.com`,
          password: 'hashed',
          active: true,
          memberId: alice.id,
          congregationId: congId,
        },
      })
      // Assign both Alice (speaker) and Bob (reader) to the same part row.
      await tx.programmePartAssignment.update({
        where: { id_congregationId: { id: partAssignmentId, congregationId: congId } },
        data: { assigneeId: alice.id, assistantId: bobMemberId },
      })
      return alice.id
    })

    // Bob adds an absence → hasConflict should flip to true.
    await withScope(congId, tx =>
      createDayOff(
        tx,
        bobAccountId,
        bobMemberId,
        new Date('2027-08-10T00:00:00Z'),
        new Date('2027-08-11T00:00:00Z'),
        congId,
      ),
    )

    // Then Alice adds and immediately removes an absence, refreshing for her.
    // A refresh keyed on Alice must NOT clear the flag that Bob's absence
    // still legitimately owns.
    await withScope(congId, async tx => {
      const kind = await tx.eventKind.findFirstOrThrow({ where: { key: 'off', congregationId: congId } })
      const aliceAccount = await tx.userAccount.findFirstOrThrow({
        where: { memberId: aliceId, congregationId: congId },
      })
      await tx.event.create({
        data: {
          name: `Alice absence ${congId}`,
          kindId: kind.id,
          startDate: new Date('2027-08-10T00:00:00Z'),
          endDate: new Date('2027-08-11T00:00:00Z'),
          createdById: aliceAccount.id,
          congregationId: congId,
          status: 'released',
        },
      })
      await tx.event.deleteMany({ where: { name: `Alice absence ${congId}`, congregationId: congId } })
      await refreshConflictFlags(
        tx,
        aliceId,
        new Date('2027-08-10T00:00:00Z'),
        new Date('2027-08-11T00:00:00Z'),
        congId,
      )
    })

    const still = await withScope(congId, tx =>
      tx.programmePartAssignment.findFirstOrThrow({
        where: { id: partAssignmentId, congregationId: congId },
        select: { hasConflict: true },
      }),
    )
    expect(still.hasConflict).toBe(true)
  })
})

describe('Draft-event conflict flow (integration)', () => {
  it('flips hasConflict on a draft event assignment when the assignee creates an overlapping absence', async () => {
    const { congId, bobAccountId, bobMemberId, partAssignmentId } = await provisionCongregation('flip')

    await withScope(congId, tx =>
      createDayOff(
        tx,
        bobAccountId,
        bobMemberId,
        new Date('2027-08-10T00:00:00Z'),
        new Date('2027-08-11T00:00:00Z'),
        congId,
      ),
    )

    const refreshed = await withScope(congId, tx =>
      tx.programmePartAssignment.findFirstOrThrow({
        where: { id: partAssignmentId, congregationId: congId },
        select: { hasConflict: true },
      }),
    )

    expect(refreshed.hasConflict).toBe(true)
  })

  it('blocks releaseEvent while a conflict is present on a draft event', async () => {
    const { congId, managerAccountId, bobAccountId, bobMemberId, draftEventId } = await provisionCongregation('block')

    await withScope(congId, tx =>
      createDayOff(
        tx,
        bobAccountId,
        bobMemberId,
        new Date('2027-08-10T00:00:00Z'),
        new Date('2027-08-11T00:00:00Z'),
        congId,
      ),
    )

    const result = await withScope(congId, tx =>
      releaseEvent(tx, draftEventId, congId, managerAccountId, { locale: 'fr-FR', timezone: 'Europe/Paris' }),
    )

    expect(result).not.toBeNull()
    expect(result).toHaveProperty('error')

    const stillDraft = await withScope(congId, tx =>
      tx.event.findFirstOrThrow({ where: { id: draftEventId, congregationId: congId }, select: { status: true } }),
    )
    expect(stillDraft.status).toBe('draft')
  })
})
