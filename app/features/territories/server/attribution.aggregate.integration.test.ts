import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { ConflictError } from '~/shared/errors/app-error.server'

const auditMock = vi.fn()
vi.mock('~/shared/domain/audit.server', () => ({
  audit: (...args: unknown[]) => auditMock(...args),
  auditInTransaction: vi.fn(),
  AuditAction: {
    AttributionCreated: 'attribution.created',
    AttributionUpdated: 'attribution.updated',
    AttributionDeleted: 'attribution.deleted',
  },
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
let congId: number
let publisherId: number
let secondPublisherId: number
let territoryId: number

const attributionAggregate = await import('./attribution.aggregate')

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `AttrAgg ${ts}`, slug: `attr-agg-${ts}`, active: true },
  })
  congId = cong.id

  await withScope(congId, async tx => {
    const p1 = await tx.member.create({
      data: { firstname: 'Alice', lastname: 'Publisher', isPublisher: true, congregationId: congId },
    })
    publisherId = p1.id
    const p2 = await tx.member.create({
      data: { firstname: 'Bob', lastname: 'Publisher', isPublisher: true, congregationId: congId },
    })
    secondPublisherId = p2.id
    const t = await tx.territory.create({
      data: { number: `T-${ts}`, type: TerritoryKind.Classical, congregationId: congId },
    })
    territoryId = t.id
  })
})

afterAll(async () => {
  await withScope(congId, async tx => {
    await tx.attribution.deleteMany({})
    await tx.member.deleteMany({})
    await tx.territory.deleteMany({})
  })
  await testDb.congregation.deleteMany({ where: { id: congId } })
  await testDb.$disconnect()
})

function makeAssignParams(overrides: { publisherId?: number; startDate?: string } = {}) {
  return {
    publisherId: overrides.publisherId ?? publisherId,
    territoryId,
    startDate: overrides.startDate ?? '2026-01-01',
    notes: '',
    type: TerritoryAttributionKind.Default,
    congregationId: congId,
    actorId: 1,
  }
}

describe('attribution.aggregate — integration', () => {
  it('assign persists the row and audits AttributionCreated', async () => {
    auditMock.mockClear()
    const attribution = await withScope(congId, tx => attributionAggregate.assign(tx, makeAssignParams()))
    const row = await testDb.attribution.findUniqueOrThrow({ where: { id: attribution.id } })
    expect(row.publisherId).toBe(publisherId)
    expect(row.territoryId).toBe(territoryId)
    expect(row.endDate).toBeNull()
    expect(row.lateDate).not.toBeNull()
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'attribution.created', entityId: attribution.id }),
    )
    await testDb.attribution.delete({ where: { id: attribution.id } })
  })

  it('assign throws ConflictError when an active attribution already covers the publisher × territory', async () => {
    const first = await withScope(congId, tx => attributionAggregate.assign(tx, makeAssignParams()))

    await expect(
      withScope(congId, tx => attributionAggregate.assign(tx, makeAssignParams({ startDate: '2026-03-01' }))),
    ).rejects.toBeInstanceOf(ConflictError)

    await testDb.attribution.delete({ where: { id: first.id } })
  })

  it('markReturned stamps endDate on a single attribution', async () => {
    const attr = await withScope(congId, tx => attributionAggregate.assign(tx, makeAssignParams()))

    const endDate = new Date('2026-06-15')
    auditMock.mockClear()
    await withScope(congId, tx => attributionAggregate.markReturned(tx, attr.id, endDate, congId, 1))

    const row = await testDb.attribution.findUniqueOrThrow({ where: { id: attr.id } })
    expect(row.endDate).toEqual(endDate)
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attribution.updated',
        metadata: expect.objectContaining({ markedReturned: true }),
      }),
    )
    await testDb.attribution.delete({ where: { id: attr.id } })
  })

  it('markReturnedForPublisher bulk-closes every open attribution for the publisher', async () => {
    const a1 = await withScope(congId, tx => attributionAggregate.assign(tx, makeAssignParams()))
    const a2 = await withScope(congId, tx =>
      attributionAggregate.assign(tx, makeAssignParams({ publisherId: secondPublisherId })),
    )

    const endDate = new Date('2026-07-01')
    const closed = await withScope(congId, tx =>
      attributionAggregate.markReturnedForPublisher(tx, publisherId, endDate, congId, 1),
    )
    expect(closed).toBe(1)

    const rowA = await testDb.attribution.findUniqueOrThrow({ where: { id: a1.id } })
    const rowB = await testDb.attribution.findUniqueOrThrow({ where: { id: a2.id } })
    expect(rowA.endDate).toEqual(endDate)
    expect(rowB.endDate).toBeNull() // other publisher untouched

    await testDb.attribution.deleteMany({ where: { id: { in: [a1.id, a2.id] } } })
  })

  it('archive hard-deletes the row and audits AttributionDeleted', async () => {
    const attr = await withScope(congId, tx => attributionAggregate.assign(tx, makeAssignParams()))
    auditMock.mockClear()

    await withScope(congId, tx => attributionAggregate.archive(tx, attr.id, congId, 1))

    const row = await testDb.attribution.findUnique({ where: { id: attr.id } })
    expect(row).toBeNull()
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'attribution.deleted' }))
  })
})
