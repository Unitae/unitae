import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EntranceKind } from '../model/entrance-kind.type'
import { TerritoryKindKey } from '../model/territory-kind.type'
import { countAvailableEntrances, getAvailableEntrancesInBbox } from './buildings.server'
import { listFreeEntrancesWithoutPosition } from './free-entrances.queries'

const { unscopedDb, withScope } = await import('~/shared/infra/db.server')

const ts = Date.now()
let congregationId: number
const CTX = { phoneTypeActive: false }
const BBOX = { swLat: 48.8, swLng: 2.3, neLat: 48.9, neLng: 2.5 }
const ids: Record<string, number> = {}

function scoped<T>(fn: Parameters<typeof withScope<T>>[1]) {
  return withScope(congregationId, fn)
}

/** A commerce entrance under one prospected, active building; `at` null = no position. */
function shop(name: string, zip: string, street: string, at: [number, number] | null, territoryId?: number) {
  return scoped(async db => {
    const building = await db.building.create({
      data: {
        number: name,
        street,
        streetNormalized: street.toLowerCase(),
        zip,
        latitude: at?.[0] ?? null,
        longitude: at?.[1] ?? null,
        prospectionDate: new Date('2026-01-10'),
        congregationId,
      },
    })
    const entrance = await db.buildingEntrance.create({
      data: {
        kind: EntranceKind.Commerce,
        latitude: at?.[0] ?? null,
        longitude: at?.[1] ?? null,
        congregationId,
        buildings: { connect: { id: building.id } },
        ...(territoryId != null ? { territories: { connect: { id: territoryId } } } : {}),
      },
    })
    ids[name] = entrance.id
    return entrance
  })
}

function territory(number: string) {
  return scoped(db => db.territory.create({ data: { number, type: TerritoryKindKey.Commerces, congregationId } }))
}

beforeAll(async () => {
  const congregation = await unscopedDb.congregation.create({
    data: { name: `FreeEntrances ${ts}`, slug: `free-entrances-${ts}`, active: true },
  })
  congregationId = congregation.id

  await shop('free-93260', '93260', 'Rue des Coteaux', [48.85, 2.4])
  await shop('free-93310', '93310', 'Rue Lointaine', [48.86, 2.41])
  await shop('nopos-93260', '93260', 'Impasse du Bois', null)
  await shop('nopos-93310', '93310', 'Sentier des Vignes', null)

  // Already in a territory of the type: never free.
  const taken = await territory('C1')
  await shop('c1-a', '93260', 'Rue Prise', [48.87, 2.42], taken.id)
  await shop('c1-b', '93260', 'Rue Prise', [48.88, 2.42], taken.id)
})

afterAll(async () => {
  await scoped(async db => {
    await db.$executeRawUnsafe(
      'DELETE FROM "_BuildingEntranceToTerritory" WHERE "B" IN (SELECT id FROM "Territory" WHERE "congregationId" = $1)',
      congregationId,
    )
    await db.$executeRawUnsafe(
      'DELETE FROM "_BuildingToBuildingEntrance" WHERE "A" IN (SELECT id FROM "Building" WHERE "congregationId" = $1)',
      congregationId,
    )
    await db.territory.deleteMany({ where: { congregationId } })
    await db.buildingEntrance.deleteMany({ where: { congregationId } })
    await db.building.deleteMany({ where: { congregationId } })
  })
  await unscopedDb.congregation.delete({ where: { id: congregationId } })
})

describe('the split tool’s filters reach every place it counts or shows free entrances', () => {
  it('counts the free entrances of the postcode only', async () => {
    const all = await scoped(db => countAvailableEntrances(db, congregationId, TerritoryKindKey.Commerces, CTX))
    const filtered = await scoped(db =>
      countAvailableEntrances(db, congregationId, TerritoryKindKey.Commerces, CTX, { zip: '93260' }),
    )

    expect(all).toEqual({ total: 4, withoutCoordinates: 2 })
    expect(filtered).toEqual({ total: 2, withoutCoordinates: 1 })
  })

  it('shows the free entrances of the postcode, or of the street, only', async () => {
    const zone = (filters: Record<string, string>) =>
      scoped(db => getAvailableEntrancesInBbox(db, congregationId, TerritoryKindKey.Commerces, BBOX, CTX, filters))

    expect((await zone({ zip: '93260' })).entrances.map(e => e.id)).toEqual([ids['free-93260']])
    expect((await zone({ street: 'lointaine' })).entrances.map(e => e.id)).toEqual([ids['free-93310']])
    expect((await zone({})).entrances.map(e => e.id).sort()).toEqual([ids['free-93260'], ids['free-93310']].sort())
  })

  it('lists the free entrances no map can show, within the filters', async () => {
    const listed = await scoped(db =>
      listFreeEntrancesWithoutPosition(db, congregationId, TerritoryKindKey.Commerces, CTX, { zip: '93260' }),
    )

    expect(listed.total).toBe(1)
    expect(listed.entrances).toEqual([
      expect.objectContaining({
        id: ids['nopos-93260'],
        address: { number: 'nopos-93260', street: 'Impasse du Bois', zip: '93260' },
        latitude: null,
        longitude: null,
      }),
    ])
  })
})
