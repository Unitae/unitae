// Integration pins for event-status.server that need a real Postgres to prove
// out — currently, that transaction rollback also rolls back the
// EventReleased/EventUnreleased audit row (the whole point of the
// auditInTransaction migration in commit 7d56c680).

import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { releaseEvent, unreleaseEvent } from '~/features/events/server/event-status.server'

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
let draftEventId: number
let releasedEventId: number

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `EventStatusIntegration ${ts}`, slug: `event-status-int-${ts}`, active: true },
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

    const draft = await tx.event.create({
      data: {
        name: `Draft Event ${ts}`,
        startDate: new Date('2028-01-05T19:00:00Z'),
        endDate: new Date('2028-01-05T21:00:00Z'),
        createdById: managerAccountId,
        congregationId: congId,
        status: 'draft',
      },
    })
    draftEventId = draft.id

    const released = await tx.event.create({
      data: {
        name: `Released Event ${ts}`,
        startDate: new Date('2028-01-06T19:00:00Z'),
        endDate: new Date('2028-01-06T21:00:00Z'),
        createdById: managerAccountId,
        congregationId: congId,
        status: 'released',
      },
    })
    releasedEventId = released.id
  })
})

afterAll(async () => {
  await testDb.auditLog.deleteMany({ where: { congregationId: congId } })
  await testDb.event.deleteMany({ where: { congregationId: congId } })
  await testDb.userAccount.deleteMany({ where: { congregationId: congId } })
  await testDb.congregation.delete({ where: { id: congId } })
  await testDb.$disconnect()
})

describe('releaseEvent audit atomicity (integration)', () => {
  it('rolls back the EventReleased audit row when the outer tx aborts', async () => {
    // Wrap the release in a tx that we then abort. auditInTransaction must
    // participate in that tx so the audit row rolls back with the state flip.
    // If audit() (fire-and-forget on unscopedDb) were used, the audit row
    // would remain committed on a rollback — a divergence bug.
    await expect(
      testDb.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congId)}'`)
        await releaseEvent(tx, draftEventId, congId, managerAccountId, {
          locale: 'fr-FR',
          timezone: 'Europe/Paris',
        })
        throw new Error('force rollback')
      }),
    ).rejects.toThrow('force rollback')

    const auditRows = await testDb.auditLog.findMany({
      where: { congregationId: congId, entityType: 'Event', entityId: draftEventId, action: 'event.released' },
    })
    expect(auditRows).toEqual([])

    // State flip should also have rolled back.
    const stillDraft = await withScope(congId, tx =>
      tx.event.findFirstOrThrow({ where: { id: draftEventId, congregationId: congId }, select: { status: true } }),
    )
    expect(stillDraft.status).toBe('draft')
  })

  it('rolls back the EventUnreleased audit row when the outer tx aborts', async () => {
    await expect(
      testDb.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL app.congregation_id = '${String(congId)}'`)
        await unreleaseEvent(tx, releasedEventId, congId, managerAccountId)
        throw new Error('force rollback')
      }),
    ).rejects.toThrow('force rollback')

    const auditRows = await testDb.auditLog.findMany({
      where: { congregationId: congId, entityType: 'Event', entityId: releasedEventId, action: 'event.unreleased' },
    })
    expect(auditRows).toEqual([])

    // State flip should also have rolled back.
    const stillReleased = await withScope(congId, tx =>
      tx.event.findFirstOrThrow({ where: { id: releasedEventId, congregationId: congId }, select: { status: true } }),
    )
    expect(stillReleased.status).toBe('released')
  })

  // Positive control: on a clean commit, the audit row exists.
  it('commits the EventReleased audit row alongside the state flip', async () => {
    // Fresh draft so this test is order-independent.
    const targetId = await withScope(congId, async tx => {
      const e = await tx.event.create({
        data: {
          name: `Draft-for-commit ${ts}`,
          startDate: new Date('2028-01-07T19:00:00Z'),
          endDate: new Date('2028-01-07T21:00:00Z'),
          createdById: managerAccountId,
          congregationId: congId,
          status: 'draft',
        },
      })
      return e.id
    })

    await withScope(congId, tx =>
      releaseEvent(tx, targetId, congId, managerAccountId, { locale: 'fr-FR', timezone: 'Europe/Paris' }),
    )

    const auditRows = await testDb.auditLog.findMany({
      where: { congregationId: congId, entityType: 'Event', entityId: targetId, action: 'event.released' },
    })
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0].actorId).toBe(managerAccountId)
  })
})
