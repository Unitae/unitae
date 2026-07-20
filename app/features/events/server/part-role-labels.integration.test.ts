// End-to-end proof that per-part role labels flow all the way through:
// schema column exists → template stores them → the three write paths
// (apply-template, generation, duplicate) denormalize them onto the target
// row. If the migration, the Prisma client, or any of those copy paths are
// mismatched, this test breaks — which is what the unit suite (mocked Prisma)
// cannot catch on its own.

import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { duplicateTemplate } from '~/features/events/server/duplicate-template.server'
import { applyTemplateToEvent } from '~/features/events/server/event-parts.server'
import { generateEventsFromTemplate } from '~/features/events/server/event-template-generation.server'

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

// Distinct sentinels per part so an ordering regression (swapping parts[0]
// and parts[1] during the copy) fails visibly.
const P1_SPEAKER = 'STUDENT-SENTINEL-P1'
const P2_SPEAKER = 'STUDENT-SENTINEL-P2'
const P2_READER = 'HOUSEHOLDER-SENTINEL-P2'

interface SeedTemplateResult {
  templateId: number
}

function seedTemplate(key: string, weekDay: number | null = null): Promise<SeedTemplateResult> {
  return withScope(congId, async tx => {
    const template = await tx.eventTemplate.create({
      data: {
        name: `Midweek ${key}`,
        key,
        weekDay,
        congregationId: congId,
        parts: {
          create: [
            {
              name: 'Bible reading',
              order: 1,
              durationMin: 5,
              speakerLabel: P1_SPEAKER,
              readerLabel: null,
              congregationId: congId,
            },
            {
              name: 'Return visit',
              order: 2,
              durationMin: 10,
              speakerLabel: P2_SPEAKER,
              readerLabel: P2_READER,
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
    return { templateId: template.id }
  })
}

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
  })
})

afterAll(async () => {
  await testDb.eventPartAllowedRole.deleteMany({ where: { congregationId: congId } })
  await testDb.eventPart.deleteMany({ where: { congregationId: congId } })
  await testDb.templatePartAllowedRole.deleteMany({ where: { congregationId: congId } })
  await testDb.templatePart.deleteMany({ where: { congregationId: congId } })
  await testDb.event.deleteMany({ where: { congregationId: congId } })
  await testDb.eventTemplate.deleteMany({ where: { congregationId: congId } })
  await testDb.auditLog.deleteMany({ where: { congregationId: congId } })
  await testDb.userAccount.deleteMany({ where: { congregationId: congId } })
  await testDb.congregation.delete({ where: { id: congId } })
  await testDb.$disconnect()
})

describe('per-part role labels — end-to-end', () => {
  it('applyTemplateToEvent denormalizes speakerLabel/readerLabel from template parts onto assignments', async () => {
    const { templateId } = await seedTemplate(`apply-${ts}`)
    const event = await withScope(congId, tx =>
      tx.event.create({
        data: {
          name: `Apply ${ts}`,
          startDate: new Date('2028-02-05T19:00:00Z'),
          endDate: new Date('2028-02-05T21:00:00Z'),
          createdById: managerAccountId,
          congregationId: congId,
          status: 'draft',
          templateId,
        },
      }),
    )

    await withScope(congId, tx => applyTemplateToEvent(tx, event.id, templateId, congId, managerAccountId))

    const assignments = await testDb.eventPart.findMany({
      where: { eventId: event.id, congregationId: congId },
      orderBy: { order: 'asc' },
      select: { name: true, speakerLabel: true, readerLabel: true },
    })

    expect(assignments).toEqual([
      { name: 'Bible reading', speakerLabel: P1_SPEAKER, readerLabel: null },
      { name: 'Return visit', speakerLabel: P2_SPEAKER, readerLabel: P2_READER },
      { name: 'Instruction talk', speakerLabel: null, readerLabel: null },
    ])
  })

  it('generateEventsFromTemplate copies speakerLabel/readerLabel onto every generated assignment', async () => {
    // weekDay=2 (Tuesday) is required — generation uses computeDatesForWeekdayCount.
    const { templateId } = await seedTemplate(`generate-${ts}`, 2)

    const events = await withScope(congId, tx =>
      generateEventsFromTemplate(tx, templateId, 1, managerAccountId, congId, 'UTC', new Date('2029-01-01T00:00:00Z')),
    )
    expect(events.length).toBeGreaterThan(0)

    const assignments = await testDb.eventPart.findMany({
      where: { eventId: events[0].id, congregationId: congId },
      orderBy: { order: 'asc' },
      select: { name: true, speakerLabel: true, readerLabel: true },
    })

    expect(assignments).toEqual([
      { name: 'Bible reading', speakerLabel: P1_SPEAKER, readerLabel: null },
      { name: 'Return visit', speakerLabel: P2_SPEAKER, readerLabel: P2_READER },
      { name: 'Instruction talk', speakerLabel: null, readerLabel: null },
    ])
  })

  it('duplicateTemplate carries speakerLabel/readerLabel onto the cloned template parts', async () => {
    const { templateId } = await seedTemplate(`duplicate-${ts}`)

    const duplicated = await withScope(congId, tx => duplicateTemplate(tx, templateId, congId))
    expect(duplicated).not.toBeNull()

    const parts = await testDb.templatePart.findMany({
      where: { templateId: duplicated?.id, congregationId: congId },
      orderBy: { order: 'asc' },
      select: { name: true, speakerLabel: true, readerLabel: true },
    })

    expect(parts).toEqual([
      { name: 'Bible reading', speakerLabel: P1_SPEAKER, readerLabel: null },
      { name: 'Return visit', speakerLabel: P2_SPEAKER, readerLabel: P2_READER },
      { name: 'Instruction talk', speakerLabel: null, readerLabel: null },
    ])
  })
})
