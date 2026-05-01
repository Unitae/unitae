import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

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
let primaryTerritoryId: number
let otherTerritoryId: number
let crossCongTerritoryId: number
let entranceInPrimaryId: number
let entranceInOtherId: number
let entranceAvailableId: number
let entranceWrongKindId: number
let entranceCrossCongId: number

const { getEntrancesInBbox } = await import('./buildings.server')

beforeAll(async () => {
  const primary = await testDb.congregation.create({
    data: { name: `Bbox Primary ${ts}`, slug: `bbox-primary-${ts}`, active: true },
  })
  primaryCongId = primary.id

  const other = await testDb.congregation.create({
    data: { name: `Bbox Other ${ts}`, slug: `bbox-other-${ts}`, active: true },
  })
  otherCongId = other.id

  await withScope(primaryCongId, async tx => {
    const primaryTerritory = await tx.territory.create({
      data: { number: `T-PRIM-${ts}`, type: TerritoryKind.Classical, congregationId: primaryCongId },
    })
    primaryTerritoryId = primaryTerritory.id

    const otherTerritory = await tx.territory.create({
      data: { number: `T-OTHR-${ts}`, type: TerritoryKind.Classical, congregationId: primaryCongId },
    })
    otherTerritoryId = otherTerritory.id

    const buildingIn = await tx.building.create({
      data: {
        number: '1',
        street: 'Rue Test',
        zip: '75001',
        latitude: 48.85,
        longitude: 2.35,
        congregationId: primaryCongId,
      },
    })
    const entranceIn = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Residential,
        latitude: 48.85,
        longitude: 2.35,
        homes: 4,
        congregationId: primaryCongId,
        buildings: { connect: { id: buildingIn.id } },
        territories: { connect: { id: primaryTerritoryId } },
      },
    })
    entranceInPrimaryId = entranceIn.id

    const buildingOnOther = await tx.building.create({
      data: {
        number: '2',
        street: 'Rue Test',
        zip: '75001',
        latitude: 48.86,
        longitude: 2.36,
        congregationId: primaryCongId,
      },
    })
    const entranceOnOther = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Residential,
        latitude: 48.86,
        longitude: 2.36,
        homes: 6,
        congregationId: primaryCongId,
        buildings: { connect: { id: buildingOnOther.id } },
        territories: { connect: { id: otherTerritoryId } },
      },
    })
    entranceInOtherId = entranceOnOther.id

    const buildingFree = await tx.building.create({
      data: {
        number: '3',
        street: 'Rue Test',
        zip: '75001',
        latitude: 48.87,
        longitude: 2.37,
        congregationId: primaryCongId,
      },
    })
    const entranceFree = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Residential,
        latitude: 48.87,
        longitude: 2.37,
        homes: 2,
        congregationId: primaryCongId,
        buildings: { connect: { id: buildingFree.id } },
      },
    })
    entranceAvailableId = entranceFree.id

    const buildingShop = await tx.building.create({
      data: {
        number: '4',
        street: 'Rue Test',
        zip: '75001',
        latitude: 48.88,
        longitude: 2.38,
        congregationId: primaryCongId,
      },
    })
    const entranceShop = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Commerce,
        latitude: 48.88,
        longitude: 2.38,
        congregationId: primaryCongId,
        buildings: { connect: { id: buildingShop.id } },
      },
    })
    entranceWrongKindId = entranceShop.id
  })

  await withScope(otherCongId, async tx => {
    const crossCongTerritory = await tx.territory.create({
      data: { number: `T-XC-${ts}`, type: TerritoryKind.Classical, congregationId: otherCongId },
    })
    crossCongTerritoryId = crossCongTerritory.id

    const buildingCross = await tx.building.create({
      data: {
        number: '5',
        street: 'Rue Test',
        zip: '75001',
        latitude: 48.85,
        longitude: 2.35,
        congregationId: otherCongId,
      },
    })
    const entranceCross = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Residential,
        latitude: 48.85,
        longitude: 2.35,
        congregationId: otherCongId,
        buildings: { connect: { id: buildingCross.id } },
        territories: { connect: { id: crossCongTerritoryId } },
      },
    })
    entranceCrossCongId = entranceCross.id
  })
})

afterAll(async () => {
  for (const cid of [primaryCongId, otherCongId]) {
    if (!cid) continue
    await withScope(cid, async tx => {
      await tx.attribution.deleteMany({})
      await tx.buildingResidentialData.deleteMany({})
      await tx.buildingAccess.deleteMany({})
      await tx.buildingEntrance.deleteMany({})
      await tx.building.deleteMany({})
      await tx.territory.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [primaryCongId, otherCongId] } } })
  await testDb.$disconnect()
})

describe('getEntrancesInBbox (integration)', () => {
  const wideBbox = { swLat: 48.0, swLng: 2.0, neLat: 49.0, neLng: 3.0 }

  it('classifies entrances by status relative to the requested territory', async () => {
    const result = await withScope(primaryCongId, tx =>
      getEntrancesInBbox(tx, primaryCongId, primaryTerritoryId, TerritoryKind.Classical, wideBbox),
    )

    expect(result.truncated).toBe(false)

    const byId = new Map(result.entrances.map(e => [e.id, e]))
    expect(byId.get(entranceInPrimaryId)?.status).toBe('in-this-territory')
    expect(byId.get(entranceInPrimaryId)?.otherTerritory).toBeNull()

    expect(byId.get(entranceInOtherId)?.status).toBe('on-other-territory')
    expect(byId.get(entranceInOtherId)?.otherTerritory?.id).toBe(otherTerritoryId)

    expect(byId.get(entranceAvailableId)?.status).toBe('available')
  })

  it('filters out entrances whose kind does not match the territory type', async () => {
    const result = await withScope(primaryCongId, tx =>
      getEntrancesInBbox(tx, primaryCongId, primaryTerritoryId, TerritoryKind.Classical, wideBbox),
    )
    expect(result.entrances.find(e => e.id === entranceWrongKindId)).toBeUndefined()
  })

  it('only returns entrances whose centroid falls within the bbox', async () => {
    const tightBbox = { swLat: 48.849, swLng: 2.349, neLat: 48.851, neLng: 2.351 }
    const result = await withScope(primaryCongId, tx =>
      getEntrancesInBbox(tx, primaryCongId, primaryTerritoryId, TerritoryKind.Classical, tightBbox),
    )
    expect(result.entrances.map(e => e.id)).toEqual([entranceInPrimaryId])
  })

  it('does not leak entrances from another congregation', async () => {
    const result = await withScope(primaryCongId, tx =>
      getEntrancesInBbox(tx, primaryCongId, primaryTerritoryId, TerritoryKind.Classical, wideBbox),
    )
    expect(result.entrances.find(e => e.id === entranceCrossCongId)).toBeUndefined()
  })

  it('flags truncated when the result exceeds the limit', async () => {
    const result = await withScope(primaryCongId, tx =>
      getEntrancesInBbox(tx, primaryCongId, primaryTerritoryId, TerritoryKind.Classical, wideBbox, 1),
    )
    expect(result.truncated).toBe(true)
    expect(result.entrances).toHaveLength(1)
  })

  it('returns an empty array when no entrance is in the bbox', async () => {
    const emptyBbox = { swLat: 0, swLng: 0, neLat: 1, neLng: 1 }
    const result = await withScope(primaryCongId, tx =>
      getEntrancesInBbox(tx, primaryCongId, primaryTerritoryId, TerritoryKind.Classical, emptyBbox),
    )
    expect(result.entrances).toEqual([])
    expect(result.truncated).toBe(false)
  })
})
