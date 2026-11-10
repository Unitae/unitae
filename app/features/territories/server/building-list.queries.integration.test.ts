import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildingWorkList, checkDates, type WorkList } from '../model/building-list'
import { EntranceKind } from '../model/entrance-kind.type'
import { TerritoryAccess } from '../model/territory-access.type'
import { countBuildingViews, findBuildingNeighbours, findSurveyWalk, listBuildingPage } from './building-list.queries'

const { unscopedDb, withScope } = await import('~/shared/infra/db.server')

const NOW = new Date('2026-11-10T12:00:00Z')
const DATES = checkDates(24, NOW)
const LONG_AGO = new Date('2023-01-01T00:00:00Z')
const VERY_LONG_AGO = new Date('2021-01-01T00:00:00Z')
const RECENTLY = new Date('2026-06-01T00:00:00Z')
const LAST_MONTH = new Date('2026-10-15T00:00:00Z')
const ts = Date.now()
let congregationId: number

interface Fixture {
  name: string
  expected: WorkList | null
  data: Record<string, unknown>
  entrance?: Record<string, unknown>
}

// One building per class the lists must tell apart. Every name is its street, so a failure says which one.
const FIXTURES: Fixture[] = [
  { name: 'up to date', expected: null, data: { prospectionDate: RECENTLY } },
  { name: 'stale', expected: 'check', data: { prospectionDate: LONG_AGO } },
  { name: 'hand made never prospected', expected: 'check', data: { prospectionDate: null } },
  {
    name: 'new from the bano',
    expected: 'new',
    data: { inOpenData: true, lastSeenInSourceAt: RECENTLY, prospectionDate: null },
  },
  {
    name: 'missing and stale',
    expected: 'missing',
    data: { inOpenData: false, lastSeenInSourceAt: LONG_AGO, prospectionDate: LONG_AGO },
  },
  {
    name: 'listed and up to date',
    expected: null,
    data: { inOpenData: true, lastSeenInSourceAt: RECENTLY, prospectionDate: RECENTLY },
  },
  {
    name: 'intercom without homes',
    expected: 'check',
    data: { prospectionDate: RECENTLY },
    entrance: { kind: EntranceKind.Residential, access: TerritoryAccess.Intercom, homes: null },
  },
  {
    name: 'code without phones',
    expected: 'check',
    data: { prospectionDate: RECENTLY },
    entrance: { kind: EntranceKind.Residential, access: TerritoryAccess.Code, isOpenEarly: false, homes: 4 },
  },
  {
    name: 'homes without access',
    expected: 'check',
    data: { prospectionDate: RECENTLY },
    entrance: { kind: EntranceKind.Residential, access: null, homes: 6 },
  },
  {
    name: 'shop without access',
    expected: null,
    data: { prospectionDate: RECENTLY },
    entrance: { kind: EntranceKind.Commerce, access: null, homes: 3 },
  },
  { name: 'outside for long', expected: 'check', data: { inTerritory: false, createdAt: LONG_AGO } },
  { name: 'outside since last month', expected: null, data: { inTerritory: false, createdAt: LAST_MONTH } },
  { name: 'inactive for very long', expected: 'check', data: { active: false, prospectionDate: VERY_LONG_AGO } },
  { name: 'inactive for long', expected: null, data: { active: false, prospectionDate: LONG_AGO } },
  {
    name: 'inactive and missing',
    expected: null,
    data: { active: false, inOpenData: false, lastSeenInSourceAt: LONG_AGO, prospectionDate: RECENTLY },
  },
]

function scoped<T>(fn: Parameters<typeof withScope<T>>[1]) {
  return withScope(congregationId, fn)
}

function createBuilding(street: string, data: Record<string, unknown>, entrance?: Record<string, unknown>) {
  return scoped(db =>
    db.building.create({
      data: {
        number: '1',
        street,
        streetNormalized: street.toLowerCase(),
        zip: '93260',
        createdAt: LONG_AGO,
        ...data,
        congregationId,
        ...(entrance ? { entrances: { create: { ...entrance, congregationId } } } : {}),
      },
    }),
  )
}

async function streetsIn(view: 'check' | 'new' | 'missing' | 'active' | 'all', query = '') {
  const page = await scoped(db =>
    listBuildingPage(db, congregationId, {
      view,
      params: new URLSearchParams(query),
      sort: 'address',
      page: 1,
      pageSize: 100,
      dates: DATES,
      locale: 'fr',
    }),
  )
  return page.rows.map(row => row.street)
}

beforeAll(async () => {
  const congregation = await unscopedDb.congregation.create({
    data: { name: `BuildingList ${ts}`, slug: `building-list-${ts}`, active: true },
  })
  congregationId = congregation.id
  for (const fixture of FIXTURES) await createBuilding(fixture.name, fixture.data, fixture.entrance)
})

afterAll(async () => {
  await scoped(async db => {
    await db.$executeRawUnsafe(
      'DELETE FROM "_BuildingToBuildingEntrance" WHERE "A" IN (SELECT id FROM "Building" WHERE "congregationId" = $1)',
      congregationId,
    )
    await db.buildingEntrance.deleteMany({ where: { congregationId } })
    await db.building.deleteMany({ where: { congregationId } })
  })
  await unscopedDb.congregation.delete({ where: { id: congregationId } })
})

describe('listBuildingPage — the work lists', () => {
  it('puts each building in the work list its own facts give it, and in no other', async () => {
    const lists = { check: await streetsIn('check'), new: await streetsIn('new'), missing: await streetsIn('missing') }
    const facts = await scoped(db =>
      db.building.findMany({
        where: { congregationId },
        select: {
          street: true,
          active: true,
          inTerritory: true,
          inOpenData: true,
          lastSeenInSourceAt: true,
          prospectionDate: true,
          createdAt: true,
          entrances: { select: { kind: true, access: true, homes: true, phones: true, isOpenEarly: true } },
        },
      }),
    )

    for (const fixture of FIXTURES) {
      const building = facts.find(f => f.street === fixture.name)
      if (!building) throw new Error(`fixture ${fixture.name} missing`)
      const inLists = (Object.keys(lists) as WorkList[]).filter(list => lists[list].includes(fixture.name))
      expect(inLists, fixture.name).toEqual(fixture.expected == null ? [] : [fixture.expected])
      expect(buildingWorkList(building, DATES), fixture.name).toBe(fixture.expected)
    }
  })

  it('gives every reason in « À vérifier »', async () => {
    const page = await scoped(db =>
      listBuildingPage(db, congregationId, {
        view: 'check',
        params: new URLSearchParams(),
        sort: 'address',
        page: 1,
        pageSize: 100,
        dates: DATES,
        locale: 'fr',
      }),
    )
    expect(page.rows.find(row => row.street === 'stale')?.reasons).toEqual(['stale'])
    expect(page.rows.find(row => row.street === 'intercom without homes')?.reasons).toEqual(['homes-missing'])
  })

  it('walks « À vérifier » and « Nouveaux » from a survey, and no other list', async () => {
    const stale = await scoped(db =>
      db.building.findFirstOrThrow({ where: { congregationId, street: 'stale' }, select: { id: true } }),
    )
    const walk = (from: string | null) =>
      scoped(db =>
        findSurveyWalk(db, congregationId, { buildingId: stale.id, from, validity: 24, locale: 'fr', now: NOW }),
      )
    const checkCount = FIXTURES.filter(f => f.expected === 'check').length

    expect(await walk('view=check')).toMatchObject({ view: 'check', total: checkCount })
    expect((await walk('view=check'))?.position).toBeGreaterThan(0)
    expect(await walk('view=new')).toMatchObject({ view: 'new', position: null, total: 1 })
    expect(await walk('view=all')).toBeNull()
    expect(await walk(null)).toBeNull()
  })

  it('counts every view with the same filters as the list', async () => {
    const counts = await scoped(db =>
      countBuildingViews(db, congregationId, { params: new URLSearchParams(), dates: DATES }),
    )
    const expected = (list: WorkList) => FIXTURES.filter(f => f.expected === list).length

    expect(counts).toEqual({
      active: FIXTURES.filter(f => f.data.active !== false).length,
      check: expected('check'),
      new: expected('new'),
      missing: expected('missing'),
      all: FIXTURES.length,
    })
  })
})

describe('listBuildingPage — order, pages and filters', () => {
  const ROAD = 'Allee de l Ordre'

  beforeAll(async () => {
    for (const number of ['10', '2', '1', '2 bis']) {
      await createBuilding(ROAD, { number, zip: '93310', prospectionDate: RECENTLY })
    }
  })

  function page(pageNumber: number, sort: 'address' | 'oldest' | 'recent' = 'address') {
    return scoped(db =>
      listBuildingPage(db, congregationId, {
        view: 'all',
        params: new URLSearchParams('zip=93310'),
        sort,
        page: pageNumber,
        pageSize: 3,
        dates: DATES,
        locale: 'fr',
      }),
    )
  }

  it('orders numbers the way they are read, from one page to the next', async () => {
    const first = await page(1)
    const second = await page(2)

    expect(first.rows.map(row => row.number)).toEqual(['1', '2', '2 bis'])
    expect(second.rows.map(row => row.number)).toEqual(['10'])
    expect(first).toMatchObject({ total: 4, pages: 2 })
  })

  it('finds where a building stands in its list and which one comes next, in the list’s order', async () => {
    const neighbours = (number: string) =>
      scoped(async db => {
        const building = await db.building.findFirstOrThrow({ where: { congregationId, street: ROAD, number } })
        return findBuildingNeighbours(db, congregationId, {
          view: 'all',
          params: new URLSearchParams('zip=93310'),
          sort: 'address',
          dates: DATES,
          locale: 'fr',
          buildingId: building.id,
        })
      })
    const idOf = (number: string) =>
      scoped(db => db.building.findFirstOrThrow({ where: { congregationId, street: ROAD, number } })).then(b => b.id)

    expect(await neighbours('2')).toEqual({ position: 2, total: 4, nextId: await idOf('2 bis') })
    expect(await neighbours('10')).toEqual({ position: 4, total: 4, nextId: null })
  })

  it('offers the first of the list to a building no longer in it', async () => {
    const outside = await scoped(db =>
      db.building.findFirstOrThrow({ where: { congregationId, street: 'up to date' }, select: { id: true } }),
    )
    const first = await scoped(db =>
      db.building.findFirstOrThrow({ where: { congregationId, street: ROAD, number: '1' }, select: { id: true } }),
    )

    expect(
      await scoped(db =>
        findBuildingNeighbours(db, congregationId, {
          view: 'all',
          params: new URLSearchParams('zip=93310'),
          sort: 'address',
          dates: DATES,
          locale: 'fr',
          buildingId: outside.id,
        }),
      ),
    ).toEqual({ position: null, total: 4, nextId: first.id })
  })

  it('keeps every filter when several are combined', async () => {
    expect(await streetsIn('all', `type=Classical&access=${TerritoryAccess.Intercom}`)).toEqual([])
    expect(await streetsIn('all', 'type=Classical')).toEqual(['homes without access', 'code without phones'].sort())
    expect(await streetsIn('all', `type=Classical&access=${TerritoryAccess.Code}`)).toEqual(['code without phones'])
  })

  it('narrows a work list with the filters', async () => {
    expect(await streetsIn('check', 'zip=93310')).toEqual([])
    expect(await streetsIn('check', 'search=stale')).toEqual(['stale'])
  })

  it('finds the buildings without a position', async () => {
    expect(await streetsIn('all', 'zip=93310&position=none')).toHaveLength(4)
    await scoped(db =>
      db.building.updateMany({
        where: { congregationId, street: ROAD, number: '1' },
        data: { latitude: 48.8, longitude: 2.4 },
      }),
    )
    expect(await streetsIn('all', 'zip=93310&position=none')).toHaveLength(3)
  })
})
