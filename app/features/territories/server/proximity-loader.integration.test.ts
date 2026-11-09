/**
 * Confirms `listTerritoryRows` and `listOpenAttributions` measure each row's
 * distance through the territory's entrances and buildings, for the
 * territories and attributions lists' proximity order.
 *
 * Unit tests cover `closestTerritoryPoint` in isolation; this exercises the
 * full Prisma path including the nested select (entrances → buildings) the
 * lists rely on.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: {},
}))

const { listTerritoryRows } = await import('./territory-list.queries')
const { sortTerritories } = await import('~/features/territories/model/territory-list')
const { listOpenAttributions } = await import('./attribution-list.queries')
const { sortAttributions } = await import('~/features/territories/model/attribution-list')

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
let nearId: number
let farId: number
let noCoordsId: number
let nearAttributionId: number
let farAttributionId: number
let noCoordsAttributionId: number

const origin = { lat: 48.8566, lng: 2.3522 } // Paris centre

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `ProximityLoader ${ts}`, slug: `proximity-loader-${ts}`, active: true },
  })
  congregationId = cong.id

  await withScope(congregationId, async tx => {
    // Near territory — building ~500m from origin.
    const near = await tx.territory.create({
      data: { number: '01', type: TerritoryKindKey.Classical, congregationId },
    })
    nearId = near.id
    await tx.buildingEntrance.create({
      data: {
        congregationId,
        latitude: 48.86,
        longitude: 2.355,
        buildings: {
          create: { number: '1', street: 'Rue Près', streetNormalized: 'rue pres', zip: '75001', congregationId },
        },
        territories: { connect: { id: near.id } },
      },
    })

    // Far territory — ~5km from origin.
    const far = await tx.territory.create({
      data: { number: '02', type: TerritoryKindKey.Classical, congregationId },
    })
    farId = far.id
    await tx.buildingEntrance.create({
      data: {
        congregationId,
        latitude: 48.9,
        longitude: 2.4,
        buildings: {
          create: { number: '2', street: 'Rue Loin', streetNormalized: 'rue loin', zip: '75019', congregationId },
        },
        territories: { connect: { id: far.id } },
      },
    })

    // No-coords territory — entrance and building both null lat/lng.
    const noCoords = await tx.territory.create({
      data: { number: '03', type: TerritoryKindKey.Classical, congregationId },
    })
    noCoordsId = noCoords.id
    await tx.buildingEntrance.create({
      data: {
        congregationId,
        latitude: null,
        longitude: null,
        buildings: {
          create: { number: '3', street: 'Rue Sans', streetNormalized: 'rue sans', zip: '75020', congregationId },
        },
        territories: { connect: { id: noCoords.id } },
      },
    })

    // Attach an active attribution to each territory so the attribution
    // loader has rows to partition too.
    const publisher = await tx.member.create({
      data: {
        firstname: 'P',
        lastname: 'Q',
        firstnameNormalized: 'p',
        lastnameNormalized: 'q',
        congregationId,
      },
    })
    const today = new Date()
    const future = new Date()
    future.setMonth(future.getMonth() + 1)
    nearAttributionId = (
      await tx.attribution.create({
        data: {
          territoryId: near.id,
          publisherId: publisher.id,
          type: TerritoryAttributionKind.Default,
          startDate: today,
          lateDate: future,
          congregationId,
        },
      })
    ).id
    farAttributionId = (
      await tx.attribution.create({
        data: {
          territoryId: far.id,
          publisherId: publisher.id,
          type: TerritoryAttributionKind.Default,
          startDate: today,
          lateDate: future,
          congregationId,
        },
      })
    ).id
    noCoordsAttributionId = (
      await tx.attribution.create({
        data: {
          territoryId: noCoords.id,
          publisherId: publisher.id,
          type: TerritoryAttributionKind.Default,
          startDate: today,
          lateDate: future,
          congregationId,
        },
      })
    ).id
  })
})

afterAll(async () => {
  await withScope(congregationId, async tx => {
    await tx.attribution.deleteMany({})
    await tx.buildingResidentialData.deleteMany({})
    await tx.buildingEntrance.deleteMany({})
    await tx.building.deleteMany({})
    await tx.territory.deleteMany({})
    await tx.member.deleteMany({})
  })
  await testDb.congregation.delete({ where: { id: congregationId } })
  await testDb.$disconnect()
})

describe('listTerritoryRows — proximity', () => {
  it('measures each territory, so the nearest comes first and the unplaced last', async () => {
    const rows = await withScope(congregationId, tx =>
      listTerritoryRows(tx, congregationId, { where: {}, today: '2026-11-10', campaignMode: false, origin }),
    )

    expect(sortTerritories(rows, 'proximity', 'fr').map(row => row.id)).toEqual([nearId, farId, noCoordsId])
    const near = rows.find(row => row.id === nearId)?.distance ?? Number.NaN
    const far = rows.find(row => row.id === farId)?.distance ?? Number.NaN
    expect(near).toBeLessThan(far)
    expect(rows.find(row => row.id === noCoordsId)?.distance).toBeNull()
  })

  it('measures nothing without a searched place', async () => {
    const rows = await withScope(congregationId, tx =>
      listTerritoryRows(tx, congregationId, { where: {}, today: '2026-11-10', campaignMode: false }),
    )
    expect(rows).toHaveLength(3)
    expect(rows.every(row => row.distance == null)).toBe(true)
  })
})

describe('listOpenAttributions — proximity', () => {
  it('measures each attribution, so the nearest comes first and the unplaced last', async () => {
    const rows = await withScope(congregationId, tx =>
      listOpenAttributions(tx, congregationId, { where: {}, today: '2026-11-10', origin }),
    )

    expect(sortAttributions(rows, 'proximity', 'fr').map(row => row.id)).toEqual([
      nearAttributionId,
      farAttributionId,
      noCoordsAttributionId,
    ])
    expect(rows.find(row => row.id === noCoordsAttributionId)?.distance).toBeNull()
  })

  it('measures nothing without a searched place', async () => {
    const rows = await withScope(congregationId, tx =>
      listOpenAttributions(tx, congregationId, { where: {}, today: '2026-11-10' }),
    )
    expect(rows).toHaveLength(3)
    expect(rows.every(row => row.distance == null)).toBe(true)
  })
})
