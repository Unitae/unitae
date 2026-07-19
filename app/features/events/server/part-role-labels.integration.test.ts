// End-to-end proof that per-part role labels flow all the way through:
// schema column exists → template stores them → apply-template denormalizes
// them onto the assignment row. If the migration, the Prisma client, and the
// copy path are ever mismatched, this test breaks — which is what the unit
// suite (mocked Prisma) cannot catch on its own.

import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { applyTemplateToEvent } from '~/features/events/server/programme-events.server'

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
let managerAccountId: number
let templateId: number
let eventId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `PartRoleLabels ${ts}`, slug: `part-role-labels-${ts}`, active: true },
  })
  congId = cong.id

  await withScope(congId, async tx => {
    const manager = await tx.userAccount.create({
      data: {
        email: `manager-${ts}@test.com`,
        password: 'hashed',
        active: true,
        congregationId: congId,
      },
    })
    managerAccountId = manager.id

    // A template with two parts — one label-only-speaker, one with both slots
    // labeled — plus one part with no labels (the null baseline).
    const template = await tx.programmeTemplate.create({
      data: {
        name: `Midweek ${ts}`,
        key: `midweek-${ts}`,
        congregationId: congId,
        parts: {
          create: [
            {
              name: 'Bible reading',
              order: 1,
              durationMin: 5,
              speakerLabel: 'STUDENT-SENTINEL',
              readerLabel: null,
              congregationId: congId,
            },
            {
              name: 'Return visit',
              order: 2,
              durationMin: 10,
              speakerLabel: 'STUDENT-SENTINEL',
              readerLabel: 'HOUSEHOLDER-SENTINEL',
              congregationId: congId,
            },
            {
              name: 'Instruction talk',
              order: 3,
              durationMin: 15,
              // No labels — the assignment row should also carry null on both.
              congregationId: congId,
            },
          ],
        },
      },
    })
    templateId = template.id

    const event = await tx.event.create({
      data: {
        name: `Meeting ${ts}`,
        startDate: new Date('2028-02-05T19:00:00Z'),
        endDate: new Date('2028-02-05T21:00:00Z'),
        createdById: managerAccountId,
        congregationId: congId,
        status: 'draft',
      },
    })
    eventId = event.id
  })
})

afterAll(async () => {
  await testDb.programmePartAssignmentAllowedRole.deleteMany({ where: { congregationId: congId } })
  await testDb.programmePartAssignment.deleteMany({ where: { congregationId: congId } })
  await testDb.programmeTemplatePartAllowedRole.deleteMany({ where: { congregationId: congId } })
  await testDb.programmeTemplatePart.deleteMany({ where: { congregationId: congId } })
  await testDb.programmeTemplate.deleteMany({ where: { congregationId: congId } })
  await testDb.event.deleteMany({ where: { congregationId: congId } })
  await testDb.auditLog.deleteMany({ where: { congregationId: congId } })
  await testDb.userAccount.deleteMany({ where: { congregationId: congId } })
  await testDb.congregation.delete({ where: { id: congId } })
  await testDb.$disconnect()
})

describe('per-part role labels — end-to-end', () => {
  it('denormalizes speakerLabel/readerLabel from template parts onto assignments on apply', async () => {
    await withScope(congId, tx => applyTemplateToEvent(tx, eventId, templateId, congId, managerAccountId))

    const assignments = await testDb.programmePartAssignment.findMany({
      where: { eventId, congregationId: congId },
      orderBy: { order: 'asc' },
      select: { name: true, speakerLabel: true, readerLabel: true },
    })

    expect(assignments).toEqual([
      { name: 'Bible reading', speakerLabel: 'STUDENT-SENTINEL', readerLabel: null },
      { name: 'Return visit', speakerLabel: 'STUDENT-SENTINEL', readerLabel: 'HOUSEHOLDER-SENTINEL' },
      { name: 'Instruction talk', speakerLabel: null, readerLabel: null },
    ])
  })
})
