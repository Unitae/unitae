/**
 * Confirms `findTerritoriesWithDetailsPaginated` and
 * `findActiveAttributionsPaginated` produce correct distance maps and
 * partitions when given `proximityArgs.origin`.
 *
 * Unit tests cover `paginateByProximity` in isolation; this exercises the
 * full Prisma path including the eager `include` shape (entrances →
 * buildings, attributions → publisher) the loaders rely on.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: {},
}))

const { findTerritoriesWithDetailsPaginated } = await import('./territories.server')
const { findActiveAttributionsPaginated } = await import('./attributions.server')

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
      data: { number: '01', type: TerritoryKind.Classical, congregationId },
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
      data: { number: '02', type: TerritoryKind.Classical, congregationId },
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
      data: { number: '03', type: TerritoryKind.Classical, congregationId },
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

describe('findTerritoriesWithDetailsPaginated — proximity branch', () => {
  it('returns near territory first, far second, and pushes no-coords to the tail', async () => {
    const url = new URL('https://example.com/?page=1&pageSize=10')
    const result = await withScope(congregationId, tx =>
      findTerritoriesWithDetailsPaginated(tx, {}, url, congregationId, { origin }),
    )

    const order = result.territories.map(t => t.id)
    expect(order).toEqual([nearId, farId, noCoordsId])
    expect(result.pagination.total).toBe(3)
    expect('distances' in result).toBe(true)
  })

  it('reports withCoordsCount and withoutCoordsCount correctly', async () => {
    const url = new URL('https://example.com/?page=1&pageSize=10')
    const result = await withScope(congregationId, tx =>
      findTerritoriesWithDetailsPaginated(tx, {}, url, congregationId, { origin }),
    )

    expect('withCoordsCount' in result && result.withCoordsCount).toBe(2)
    expect('withoutCoordsCount' in result && result.withoutCoordsCount).toBe(1)
  })

  it('per-row distances are populated for geo-coded rows and null for the rest', async () => {
    const url = new URL('https://example.com/?page=1&pageSize=10')
    const result = await withScope(congregationId, tx =>
      findTerritoriesWithDetailsPaginated(tx, {}, url, congregationId, { origin }),
    )

    if (!('distances' in result) || result.distances == null) throw new Error('distances missing')
    const near = result.territories.find(t => t.id === nearId)!
    const far = result.territories.find(t => t.id === farId)!
    const noCoords = result.territories.find(t => t.id === noCoordsId)!

    const distNear = result.distances.get(near)
    const distFar = result.distances.get(far)
    expect(distNear).not.toBeNull()
    expect(distFar).not.toBeNull()
    expect(distNear!).toBeLessThan(distFar!)
    expect(result.distances.get(noCoords)).toBeNull()
  })

  it('honors `?page` for the combined list (page 2 returns the tail)', async () => {
    const url = new URL('https://example.com/?page=2&pageSize=2')
    const result = await withScope(congregationId, tx =>
      findTerritoriesWithDetailsPaginated(tx, {}, url, congregationId, { origin }),
    )

    expect(result.territories.map(t => t.id)).toEqual([noCoordsId])
    expect(result.pagination.page).toBe(2)
    expect(result.pagination.pages).toBe(2)
  })

  it('without proximityArgs, the function returns the same Prisma-paged shape as before', async () => {
    const url = new URL('https://example.com/?page=1&pageSize=10')
    const result = await withScope(congregationId, tx =>
      findTerritoriesWithDetailsPaginated(tx, {}, url, congregationId),
    )
    expect(result.territories).toHaveLength(3)
    expect('distances' in result).toBe(false)
  })
})

describe('findActiveAttributionsPaginated — proximity branch', () => {
  it('returns near attribution first, far second, no-coords last', async () => {
    const url = new URL('https://example.com/?page=1&pageSize=10')
    const result = await withScope(congregationId, tx =>
      findActiveAttributionsPaginated(tx, { endDate: null }, url, congregationId, { origin }),
    )

    const order = result.attributions.map(a => a.id)
    expect(order).toEqual([nearAttributionId, farAttributionId, noCoordsAttributionId])
  })

  it('without proximityArgs, sorts by startDate as today', async () => {
    const url = new URL('https://example.com/?page=1&pageSize=10')
    const result = await withScope(congregationId, tx =>
      findActiveAttributionsPaginated(tx, { endDate: null }, url, congregationId),
    )
    expect(result.attributions).toHaveLength(3)
    expect('distances' in result).toBe(false)
  })
})
