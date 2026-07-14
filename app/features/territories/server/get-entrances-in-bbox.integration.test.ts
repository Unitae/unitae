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

let commerceTerritoryId: number
let entranceCommerceFreeId: number
let entranceCommerceTakenId: number
let entranceCommerceNoCoordsId: number

const { countAvailableEntrances, getAvailableEntrancesInBbox, getEntrancesInBbox } = await import('./buildings.server')

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
        prospectionDate: new Date('2024-06-01'),
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
        prospectionDate: new Date('2024-06-01'),
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
        prospectionDate: new Date('2024-06-01'),
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

    const commerceTerritory = await tx.territory.create({
      data: { number: `T-COM-${ts}`, type: TerritoryKind.Commerces, congregationId: primaryCongId },
    })
    commerceTerritoryId = commerceTerritory.id

    const buildingCommerceFree = await tx.building.create({
      data: {
        number: '10',
        street: 'Rue Commerce',
        zip: '75001',
        latitude: 48.855,
        longitude: 2.355,
        prospectionDate: new Date('2024-06-01'),
        congregationId: primaryCongId,
      },
    })
    const entranceCommerceFree = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Commerce,
        latitude: 48.855,
        longitude: 2.355,
        congregationId: primaryCongId,
        buildings: { connect: { id: buildingCommerceFree.id } },
      },
    })
    entranceCommerceFreeId = entranceCommerceFree.id

    const buildingCommerceTaken = await tx.building.create({
      data: {
        number: '11',
        street: 'Rue Commerce',
        zip: '75001',
        latitude: 48.856,
        longitude: 2.356,
        prospectionDate: new Date('2024-06-01'),
        congregationId: primaryCongId,
      },
    })
    const entranceCommerceTaken = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Commerce,
        latitude: 48.856,
        longitude: 2.356,
        congregationId: primaryCongId,
        buildings: { connect: { id: buildingCommerceTaken.id } },
        territories: { connect: { id: commerceTerritoryId } },
      },
    })
    entranceCommerceTakenId = entranceCommerceTaken.id

    const buildingCommerceNoCoords = await tx.building.create({
      data: {
        number: '12',
        street: 'Rue Commerce',
        zip: '75001',
        prospectionDate: new Date('2024-06-01'),
        congregationId: primaryCongId,
      },
    })
    const entranceCommerceNoCoords = await tx.buildingEntrance.create({
      data: {
        kind: EntranceKind.Commerce,
        congregationId: primaryCongId,
        buildings: { connect: { id: buildingCommerceNoCoords.id } },
      },
    })
    entranceCommerceNoCoordsId = entranceCommerceNoCoords.id
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
      getEntrancesInBbox(tx, primaryCongId, primaryTerritoryId, TerritoryKind.Classical, wideBbox, {
        phoneTypeActive: true,
      }),
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
      getEntrancesInBbox(tx, primaryCongId, primaryTerritoryId, TerritoryKind.Classical, wideBbox, {
        phoneTypeActive: true,
      }),
    )
    expect(result.entrances.find(e => e.id === entranceWrongKindId)).toBeUndefined()
  })

  it('only returns entrances whose centroid falls within the bbox', async () => {
    const tightBbox = { swLat: 48.849, swLng: 2.349, neLat: 48.851, neLng: 2.351 }
    const result = await withScope(primaryCongId, tx =>
      getEntrancesInBbox(tx, primaryCongId, primaryTerritoryId, TerritoryKind.Classical, tightBbox, {
        phoneTypeActive: true,
      }),
    )
    expect(result.entrances.map(e => e.id)).toEqual([entranceInPrimaryId])
  })

  it('does not leak entrances from another congregation', async () => {
    const result = await withScope(primaryCongId, tx =>
      getEntrancesInBbox(tx, primaryCongId, primaryTerritoryId, TerritoryKind.Classical, wideBbox, {
        phoneTypeActive: true,
      }),
    )
    expect(result.entrances.find(e => e.id === entranceCrossCongId)).toBeUndefined()
  })

  it('flags truncated when the result exceeds the limit', async () => {
    const result = await withScope(primaryCongId, tx =>
      getEntrancesInBbox(
        tx,
        primaryCongId,
        primaryTerritoryId,
        TerritoryKind.Classical,
        wideBbox,
        {
          phoneTypeActive: true,
        },
        1,
      ),
    )
    expect(result.truncated).toBe(true)
    expect(result.entrances).toHaveLength(1)
    expect(result.total).toBeGreaterThan(1)
  })

  it('returns total=null when not truncated', async () => {
    const result = await withScope(primaryCongId, tx =>
      getEntrancesInBbox(tx, primaryCongId, primaryTerritoryId, TerritoryKind.Classical, wideBbox, {
        phoneTypeActive: true,
      }),
    )
    expect(result.truncated).toBe(false)
    expect(result.total).toBeNull()
  })

  it('returns an empty array when no entrance is in the bbox', async () => {
    const emptyBbox = { swLat: 0, swLng: 0, neLat: 1, neLng: 1 }
    const result = await withScope(primaryCongId, tx =>
      getEntrancesInBbox(tx, primaryCongId, primaryTerritoryId, TerritoryKind.Classical, emptyBbox, {
        phoneTypeActive: true,
      }),
    )
    expect(result.entrances).toEqual([])
    expect(result.truncated).toBe(false)
  })
})

describe('getAvailableEntrancesInBbox (integration)', () => {
  const wideBbox = { swLat: 48.0, swLng: 2.0, neLat: 49.0, neLng: 3.0 }

  it('returns commerce entrances not yet attached to any Commerces territory', async () => {
    const result = await withScope(primaryCongId, tx =>
      getAvailableEntrancesInBbox(tx, primaryCongId, TerritoryKind.Commerces, wideBbox, {
        phoneTypeActive: true,
      }),
    )

    const ids = result.entrances.map(e => e.id)
    expect(ids).toContain(entranceCommerceFreeId)
  })

  it('excludes commerce entrances already attached to a Commerces territory', async () => {
    const result = await withScope(primaryCongId, tx =>
      getAvailableEntrancesInBbox(tx, primaryCongId, TerritoryKind.Commerces, wideBbox, {
        phoneTypeActive: true,
      }),
    )

    const ids = result.entrances.map(e => e.id)
    expect(ids).not.toContain(entranceCommerceTakenId)
  })

  it('excludes commerce entrances whose building lacks a prospection date', async () => {
    const result = await withScope(primaryCongId, tx =>
      getAvailableEntrancesInBbox(tx, primaryCongId, TerritoryKind.Commerces, wideBbox, {
        phoneTypeActive: true,
      }),
    )

    const ids = result.entrances.map(e => e.id)
    expect(ids).not.toContain(entranceWrongKindId)
  })

  it('excludes entrances of a different kind', async () => {
    const result = await withScope(primaryCongId, tx =>
      getAvailableEntrancesInBbox(tx, primaryCongId, TerritoryKind.Commerces, wideBbox, {
        phoneTypeActive: true,
      }),
    )

    const ids = result.entrances.map(e => e.id)
    expect(ids).not.toContain(entranceAvailableId)
    expect(ids).not.toContain(entranceInPrimaryId)
  })

  it('never surfaces the in-this-territory status (no territory context in create mode)', async () => {
    const result = await withScope(primaryCongId, tx =>
      getAvailableEntrancesInBbox(tx, primaryCongId, TerritoryKind.Commerces, wideBbox, {
        phoneTypeActive: true,
      }),
    )

    for (const entrance of result.entrances) {
      expect(entrance.status).not.toBe('in-this-territory')
    }
  })

  it('does not leak entrances from another congregation', async () => {
    const result = await withScope(primaryCongId, tx =>
      getAvailableEntrancesInBbox(tx, primaryCongId, TerritoryKind.Commerces, wideBbox, {
        phoneTypeActive: true,
      }),
    )

    const ids = result.entrances.map(e => e.id)
    expect(ids).not.toContain(entranceCrossCongId)
  })

  it('returns an empty array when no entrance is in the bbox', async () => {
    const emptyBbox = { swLat: 0, swLng: 0, neLat: 1, neLng: 1 }
    const result = await withScope(primaryCongId, tx =>
      getAvailableEntrancesInBbox(tx, primaryCongId, TerritoryKind.Commerces, emptyBbox, {
        phoneTypeActive: true,
      }),
    )
    expect(result.entrances).toEqual([])
    expect(result.truncated).toBe(false)
  })
})

describe('countAvailableEntrances (integration)', () => {
  it('counts commerce entrances that pass availableForCreateWhere (with and without coords)', async () => {
    const result = await withScope(primaryCongId, tx =>
      countAvailableEntrances(tx, primaryCongId, TerritoryKind.Commerces, { phoneTypeActive: true }),
    )
    // free (with coords) + no-coords ; excludes taken and wrong-kind
    expect(result.total).toBe(2)
    expect(result.withoutCoordinates).toBe(1)
  })

  it('does not count entrances already attached to a territory of the same kind', async () => {
    const result = await withScope(primaryCongId, tx =>
      countAvailableEntrances(tx, primaryCongId, TerritoryKind.Commerces, { phoneTypeActive: true }),
    )
    // If entranceCommerceTaken was counted, total would be 3
    expect(result.total).toBe(2)
    // Reference the id so lint keeps the fixture pinned
    expect(entranceCommerceTakenId).toBeGreaterThan(0)
  })

  it('does not leak entrances from another congregation', async () => {
    const result = await withScope(primaryCongId, tx =>
      countAvailableEntrances(tx, primaryCongId, TerritoryKind.Commerces, { phoneTypeActive: true }),
    )
    // Cross-cong entrance is Residential in fixtures; use Hotel kind (empty in other cong) as a
    // sanity check that we don't spuriously match across congregations either.
    const otherCongResult = await withScope(otherCongId, tx =>
      countAvailableEntrances(tx, otherCongId, TerritoryKind.Commerces, { phoneTypeActive: true }),
    )
    expect(otherCongResult.total).toBe(0)
    expect(result.total).toBe(2)
    expect(entranceCommerceNoCoordsId).toBeGreaterThan(0)
    expect(entranceCommerceFreeId).toBeGreaterThan(0)
  })
})
