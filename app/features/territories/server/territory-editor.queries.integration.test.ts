import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'

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
const PROSPECTED = new Date('2026-10-03T00:00:00Z')
let congregationId: number
let otherCongregationId: number
let territoryId: number
let otherTerritoryId: number
let neverAttributedId: number
let foreignTerritoryId: number
const ids: Record<string, number> = {}

const { getEditorCenter, getTerritoryEditor, searchEditorEntrances } = await import('./territory-editor.queries')

interface EntranceFixture {
  numbers: string[]
  street: string
  homes?: number
  coordinates?: boolean
  active?: boolean
  prospected?: boolean
  territory?: number
}

async function entrance(tx: Tx, congregation: number, fixture: EntranceFixture) {
  const buildings = []
  for (const number of fixture.numbers) {
    buildings.push(
      await tx.building.create({
        data: {
          number,
          street: fixture.street,
          zip: '69100',
          active: fixture.active ?? true,
          prospectionDate: fixture.prospected === false ? null : PROSPECTED,
          congregationId: congregation,
        },
      }),
    )
  }
  const created = await tx.buildingEntrance.create({
    data: {
      kind: EntranceKind.Residential,
      homes: fixture.homes ?? 10,
      phones: 2,
      latitude: fixture.coordinates === false ? null : 45.77,
      longitude: fixture.coordinates === false ? null : 4.88,
      congregationId: congregation,
      buildings: { connect: buildings.map(building => ({ id: building.id })) },
      ...(fixture.territory != null ? { territories: { connect: { id: fixture.territory } } } : {}),
    },
  })
  return created.id
}

beforeAll(async () => {
  congregationId = (await testDb.congregation.create({ data: { name: `TE ${ts}`, slug: `te-${ts}`, active: true } })).id
  otherCongregationId = (
    await testDb.congregation.create({ data: { name: `TE O ${ts}`, slug: `te-o-${ts}`, active: true } })
  ).id

  await withScope(congregationId, async tx => {
    const create = (number: string) =>
      tx.territory.create({ data: { number, type: TerritoryKindKey.Classical, notes: '', congregationId } })
    territoryId = (await create(`T-${ts}`)).id
    await tx.territory.update({ where: { id: territoryId }, data: { notes: 'Commencer le samedi.' } })
    otherTerritoryId = (await create(`O-${ts}`)).id
    neverAttributedId = (await create(`N-${ts}`)).id

    ids.own = await entrance(tx, congregationId, {
      numbers: ['12', '14'],
      street: 'Rue Voltaire',
      territory: territoryId,
    })
    ids.ownNoPosition = await entrance(tx, congregationId, {
      numbers: ['16'],
      street: 'Rue Jean Moulin',
      coordinates: false,
      territory: territoryId,
    })
    ids.ownInactive = await entrance(tx, congregationId, {
      numbers: ['2'],
      street: 'Rue Close',
      active: false,
      territory: territoryId,
    })
    ids.onOther = await entrance(tx, congregationId, {
      numbers: ['27'],
      street: 'Rue Voltaire',
      territory: otherTerritoryId,
    })
    ids.free = await entrance(tx, congregationId, { numbers: ['33'], street: 'Boulevard Pasteur', homes: 14 })
    ids.freeOther = await entrance(tx, congregationId, { numbers: ['35'], street: 'Boulevard Pasteur', homes: 8 })
    ids.neverProspected = await entrance(tx, congregationId, {
      numbers: ['40'],
      street: 'Boulevard Pasteur',
      prospected: false,
    })

    const publisher = await tx.member.create({
      data: { firstname: 'Céline', lastname: 'Morel', isPublisher: true, congregationId },
    })
    await tx.attribution.create({
      data: { publisherId: publisher.id, territoryId, lateDate: new Date('2026-12-01'), congregationId },
    })
  })

  await withScope(otherCongregationId, async tx => {
    foreignTerritoryId = (
      await tx.territory.create({
        data: { number: `F-${ts}`, type: TerritoryKindKey.Classical, congregationId: otherCongregationId },
      })
    ).id
    await entrance(tx, otherCongregationId, {
      numbers: ['33'],
      street: 'Boulevard Pasteur',
      territory: foreignTerritoryId,
    })
  })
})

afterAll(async () => {
  for (const id of [congregationId, otherCongregationId]) {
    if (!id) continue
    await withScope(id, async tx => {
      await tx.attribution.deleteMany({})
      await tx.member.deleteMany({})
      await tx.buildingEntrance.deleteMany({})
      await tx.building.deleteMany({})
      await tx.territory.deleteMany({})
    })
  }
  await testDb.congregation.deleteMany({ where: { id: { in: [congregationId, otherCongregationId] } } })
  await testDb.$disconnect()
})

describe('getTerritoryEditor', () => {
  it('returns the territory with its entrances, the buildings of each one joined', async () => {
    const editor = await withScope(congregationId, tx => getTerritoryEditor(tx, congregationId, territoryId))

    expect(editor).toMatchObject({
      id: territoryId,
      number: `T-${ts}`,
      type: TerritoryKindKey.Classical,
      notes: 'Commencer le samedi.',
      hasHistory: true,
    })
    const byId = new Map(editor?.entrances.map(entry => [entry.id, entry]))
    expect(byId.get(ids.own)).toMatchObject({
      address: { number: '12, 14', street: 'Rue Voltaire', zip: '69100' },
      latitude: 45.77,
      longitude: 4.88,
      homes: 10,
      phones: 2,
      prospectionDate: PROSPECTED.toISOString(),
    })
    expect(byId.get(ids.ownNoPosition)).toMatchObject({ latitude: null, longitude: null })
  })

  it('leaves out an entrance whose buildings are all inactive', async () => {
    const editor = await withScope(congregationId, tx => getTerritoryEditor(tx, congregationId, territoryId))

    expect(editor?.entrances.map(entry => entry.id)).not.toContain(ids.ownInactive)
  })

  it('says a territory never attributed has no history', async () => {
    const editor = await withScope(congregationId, tx => getTerritoryEditor(tx, congregationId, neverAttributedId))

    expect(editor?.hasHistory).toBe(false)
  })

  it('finds nothing in another congregation', async () => {
    const editor = await withScope(congregationId, tx => getTerritoryEditor(tx, congregationId, foreignTerritoryId))

    expect(editor).toBeNull()
  })
})

describe('searchEditorEntrances', () => {
  const search = (query: string, territory: number | null = territoryId) =>
    withScope(congregationId, tx =>
      searchEditorEntrances(tx, congregationId, {
        kind: TerritoryKindKey.Classical,
        territoryId: territory,
        query,
        phoneTypeActive: false,
      }),
    )

  it('finds entrances by street, whatever the case, free ones without a territory', async () => {
    const results = await search('pasteur')

    expect(results.map(result => result.id)).toEqual([ids.free, ids.freeOther])
    expect(results[0]).toMatchObject({ address: { number: '33', street: 'Boulevard Pasteur' }, otherTerritory: null })
  })

  it('matches the number and the street together', async () => {
    const results = await search('35 pasteur')

    expect(results.map(result => result.id)).toEqual([ids.freeOther])
  })

  it('names the territory of its type an entrance is already on', async () => {
    const results = await search('voltaire')

    expect(results.find(result => result.id === ids.onOther)?.otherTerritory).toEqual({
      id: otherTerritoryId,
      number: `O-${ts}`,
    })
  })

  it('leaves out the entrances the territory already has', async () => {
    const results = await search('voltaire')

    expect(results.map(result => result.id)).not.toContain(ids.own)
  })

  it('offers them when the territory is being created', async () => {
    const results = await search('voltaire', null)

    expect(results.map(result => result.id)).toContain(ids.own)
  })

  it('leaves out an entrance that was never prospected, as the map does', async () => {
    const results = await search('40 pasteur')

    expect(results).toEqual([])
  })

  it('needs two characters before searching', async () => {
    expect(await search('p')).toEqual([])
  })
})

describe('getEditorCenter', () => {
  it('is the middle of the congregation’s placed entrances', async () => {
    const center = await withScope(congregationId, tx => getEditorCenter(tx, congregationId))

    expect(center?.lat).toBeCloseTo(45.77)
    expect(center?.lng).toBeCloseTo(4.88)
  })

  it('is unknown for a congregation without any placed entrance', async () => {
    const empty = await testDb.congregation.create({ data: { name: `TE E ${ts}`, slug: `te-e-${ts}`, active: true } })

    expect(await withScope(empty.id, tx => getEditorCenter(tx, empty.id))).toBeNull()
    await testDb.congregation.delete({ where: { id: empty.id } })
  })
})
