import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
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
let congId: number
let ownClassicalId: number
let otherClassicalId: number
let phoneTerritoryId: number

// Fixture entrance ids, all inside bbox lat[45.7,45.8] × lng[4.8,4.9]
let ownProspected: number
let ownBypassNoProspection: number
let availableHomesOnly: number
let availableDigicode: number
let availableHomesZero: number
let availablePhonesOnly: number
let onOtherTerritory: number
let availableCommerce: number
let unprospected: number

const { getEntrancesInBbox } = await import('./buildings.server')
const BBOX = { swLat: 45.7, swLng: 4.8, neLat: 45.8, neLng: 4.9 }

async function seedEntrance(
  tx: Tx,
  opts: {
    lat: number
    lng: number
    kind?: EntranceKind
    shopKind?: string
    homes?: number | null
    phones?: number | null
    prospected: boolean
    codeAccess?: boolean
    territoryIds?: number[]
    address: string
  },
): Promise<number> {
  const building = await tx.building.create({
    data: {
      number: opts.address,
      street: 'Rue Test',
      zip: '69001',
      prospectionDate: opts.prospected ? new Date('2024-06-01') : null,
      congregationId: congId,
    },
  })
  const entrance = await tx.buildingEntrance.create({
    data: {
      kind: opts.kind ?? EntranceKind.Residential,
      shopKind: opts.shopKind ?? '',
      homes: opts.homes ?? null,
      phones: opts.phones ?? null,
      latitude: opts.lat,
      longitude: opts.lng,
      congregationId: congId,
      buildings: { connect: [{ id: building.id }] },
      territories: opts.territoryIds ? { connect: opts.territoryIds.map(id => ({ id })) } : undefined,
    },
  })
  if (opts.codeAccess) {
    await tx.buildingAccess.create({
      data: {
        entranceId: entrance.id,
        type: TerritoryAccess.Code,
        position: 0,
        congregationId: congId,
      },
    })
  }
  return entrance.id
}

beforeAll(async () => {
  const cong = await testDb.congregation.create({
    data: { name: `Bbox ${ts}`, slug: `bbox-${ts}`, active: true },
  })
  congId = cong.id

  await withScope(congId, async tx => {
    const own = await tx.territory.create({
      data: { number: `T-own-${ts}`, type: TerritoryKind.Classical, congregationId: congId },
    })
    ownClassicalId = own.id
    const other = await tx.territory.create({
      data: { number: `T-other-${ts}`, type: TerritoryKind.Classical, congregationId: congId },
    })
    otherClassicalId = other.id
    const phone = await tx.territory.create({
      data: { number: `T-phone-${ts}`, type: TerritoryKind.Phone, congregationId: congId },
    })
    phoneTerritoryId = phone.id

    ownProspected = await seedEntrance(tx, {
      lat: 45.75,
      lng: 4.83,
      homes: 5,
      prospected: true,
      territoryIds: [ownClassicalId],
      address: '1',
    })
    ownBypassNoProspection = await seedEntrance(tx, {
      lat: 45.75,
      lng: 4.831,
      homes: null,
      prospected: false,
      territoryIds: [ownClassicalId],
      address: '2',
    })
    availableHomesOnly = await seedEntrance(tx, {
      lat: 45.76,
      lng: 4.83,
      homes: 10,
      prospected: true,
      address: '3',
    })
    availableDigicode = await seedEntrance(tx, {
      lat: 45.76,
      lng: 4.84,
      homes: null,
      prospected: true,
      codeAccess: true,
      address: '4',
    })
    availableHomesZero = await seedEntrance(tx, {
      lat: 45.76,
      lng: 4.85,
      homes: 0,
      prospected: true,
      address: '5',
    })
    availablePhonesOnly = await seedEntrance(tx, {
      lat: 45.77,
      lng: 4.83,
      homes: null,
      phones: 5,
      prospected: true,
      address: '6',
    })
    onOtherTerritory = await seedEntrance(tx, {
      lat: 45.77,
      lng: 4.84,
      homes: 3,
      prospected: true,
      territoryIds: [otherClassicalId],
      address: '7',
    })
    availableCommerce = await seedEntrance(tx, {
      lat: 45.77,
      lng: 4.85,
      kind: EntranceKind.Commerce,
      shopKind: 'food',
      prospected: true,
      address: '8',
    })
    unprospected = await seedEntrance(tx, {
      lat: 45.78,
      lng: 4.85,
      homes: 8,
      prospected: false,
      address: '9',
    })
  })
})

afterAll(async () => {
  if (congId != null) {
    await withScope(congId, async tx => {
      await tx.buildingAccess.deleteMany({})
      await tx.buildingResidentialData.deleteMany({})
      await tx.buildingEntrance.deleteMany({})
      await tx.building.deleteMany({})
      await tx.territory.deleteMany({})
    })
    await testDb.auditLog.deleteMany({ where: { congregationId: congId } })
    await testDb.congregation.deleteMany({ where: { id: congId } })
  }
  await testDb.$disconnect()
})

async function idsFor(territoryId: number, territoryType: TerritoryKind, phoneTypeActive: boolean): Promise<number[]> {
  return withScope(congId, async tx => {
    const result = await getEntrancesInBbox(tx as never, congId, territoryId, territoryType, BBOX, { phoneTypeActive })
    return result.entrances.map(e => e.id).sort((a, b) => a - b)
  })
}

describe('getEntrancesInBbox — map-visibility rule', () => {
  it('Classical territory with phone-toggle ON: only homes>0 or digicode; own bypass; commerce/homes=0/phones-only excluded', async () => {
    const ids = await idsFor(ownClassicalId, TerritoryKind.Classical, true)
    expect(ids).toContain(ownProspected)
    expect(ids).toContain(ownBypassNoProspection)
    expect(ids).toContain(availableHomesOnly)
    expect(ids).toContain(availableDigicode)
    expect(ids).toContain(onOtherTerritory)
    expect(ids).not.toContain(availableHomesZero)
    expect(ids).not.toContain(availablePhonesOnly)
    expect(ids).not.toContain(availableCommerce)
    expect(ids).not.toContain(unprospected)
  })

  it('Classical territory with phone-toggle OFF: also includes phones-only', async () => {
    const ids = await idsFor(ownClassicalId, TerritoryKind.Classical, false)
    expect(ids).toContain(availablePhonesOnly)
    expect(ids).not.toContain(availableHomesZero)
    expect(ids).not.toContain(unprospected)
  })

  it('Phone territory (toggle ON): only phones>0 or digicode; homes-only excluded', async () => {
    const ids = await idsFor(phoneTerritoryId, TerritoryKind.Phone, true)
    expect(ids).toContain(availablePhonesOnly)
    expect(ids).toContain(availableDigicode)
    expect(ids).not.toContain(availableHomesOnly)
    expect(ids).not.toContain(availableHomesZero)
    expect(ids).not.toContain(unprospected)
  })

  it('exposes buildingId on each returned entrance so the popup can link to the building view', async () => {
    const result = await withScope(congId, async tx =>
      getEntrancesInBbox(tx as never, congId, ownClassicalId, TerritoryKind.Classical, BBOX, {
        phoneTypeActive: true,
      }),
    )
    for (const entrance of result.entrances) {
      expect(entrance.buildingId).toBeGreaterThan(0)
    }
  })
})
