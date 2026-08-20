import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'

// Email queue is not the focus here — isolate from BullMQ
vi.mock('~/shared/infra/email-queue.server', () => ({
  emailQueue: { add: vi.fn() },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

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
let primaryCongId: number
let otherCongId: number

const { notify } = await import('./notify.server')

beforeAll(async () => {
  const primaryCong = await testDb.congregation.create({
    data: { name: `Notify Primary ${ts}`, slug: `notify-primary-${ts}`, active: true },
  })
  primaryCongId = primaryCong.id

  const otherCong = await testDb.congregation.create({
    data: { name: `Notify Other ${ts}`, slug: `notify-other-${ts}`, active: true },
  })
  otherCongId = otherCong.id

  await withScope(primaryCongId, async tx => {
    await tx.userAccount.create({
      data: {
        email: `notify-primary-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Alice',
        lastname: 'Primary',
        active: true,
        congregationId: primaryCongId,
      },
    })
  })

  await withScope(otherCongId, async tx => {
    await tx.userAccount.create({
      data: {
        email: `notify-other-${ts}@test.com`,
        password: 'hashed',
        firstname: 'Bob',
        lastname: 'Other',
        active: true,
        congregationId: otherCongId,
      },
    })
  })
})

afterAll(async () => {
  for (const congId of [primaryCongId, otherCongId]) {
    if (!congId) continue
    await withScope(congId, async tx => {
      await tx.notificationEvent.deleteMany({})
      await tx.userAccount.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, otherCongId] } } })
  await testDb.$disconnect()
})

describe('notify debounce isolation (integration)', () => {
  it('creates a pending notification event in the correct congregation', async () => {
    await withScope(primaryCongId, tx =>
      notify(tx, {
        type: 'board.document.created',
        entityType: 'BoardDocument',
        entityId: 100,
        congregationId: primaryCongId,
      }),
    )

    const eventInPrimary = await withScope(primaryCongId, tx =>
      tx.notificationEvent.findFirst({
        where: { congregationId: primaryCongId, type: 'board.document.created', entityId: 100 },
      }),
    )
    expect(eventInPrimary).not.toBeNull()
    expect(eventInPrimary?.status).toBe('pending')

    const eventInOther = await withScope(otherCongId, tx =>
      tx.notificationEvent.findFirst({
        where: { congregationId: otherCongId, type: 'board.document.created', entityId: 100 },
      }),
    )
    expect(eventInOther).toBeNull()
  })

  it('cancellation scoped to primary congregation does not affect other congregation — RLS isolation', async () => {
    // Both congregations share the same entity ID, producing identical debounce keys
    const sharedEntityId = 200

    await withScope(primaryCongId, tx =>
      notify(tx, {
        type: 'board.document.created',
        entityType: 'BoardDocument',
        entityId: sharedEntityId,
        congregationId: primaryCongId,
      }),
    )

    await withScope(otherCongId, tx =>
      notify(tx, {
        type: 'board.document.created',
        entityType: 'BoardDocument',
        entityId: sharedEntityId,
        congregationId: otherCongId,
      }),
    )

    // Send a cancellation event scoped to primary congregation only
    await withScope(primaryCongId, tx =>
      notify(tx, {
        type: 'board.document.deleted',
        entityType: 'BoardDocument',
        entityId: sharedEntityId,
        congregationId: primaryCongId,
      }),
    )

    const primaryEvent = await withScope(primaryCongId, tx =>
      tx.notificationEvent.findFirst({
        where: { congregationId: primaryCongId, entityId: sharedEntityId, type: 'board.document.created' },
      }),
    )
    expect(primaryEvent?.status).toBe('cancelled')

    // Other congregation's event must remain pending — RLS must block cross-congregation writes
    const otherEvent = await withScope(otherCongId, tx =>
      tx.notificationEvent.findFirst({
        where: { congregationId: otherCongId, entityId: sharedEntityId, type: 'board.document.created' },
      }),
    )
    expect(otherEvent?.status).toBe('pending')
  })

  it('queuing a second notification for the same entity cancels the first within the same congregation', async () => {
    const entityId = 300

    await withScope(primaryCongId, tx =>
      notify(tx, {
        type: 'board.document.created',
        entityType: 'BoardDocument',
        entityId,
        congregationId: primaryCongId,
      }),
    )

    await withScope(primaryCongId, tx =>
      notify(tx, {
        type: 'board.document.created',
        entityType: 'BoardDocument',
        entityId,
        congregationId: primaryCongId,
      }),
    )

    const events = await withScope(primaryCongId, tx =>
      tx.notificationEvent.findMany({
        where: { congregationId: primaryCongId, entityId, type: 'board.document.created' },
        orderBy: { createdAt: 'asc' },
      }),
    )

    expect(events).toHaveLength(2)
    expect(events[0].status).toBe('cancelled')
    expect(events[1].status).toBe('pending')
  })
})
