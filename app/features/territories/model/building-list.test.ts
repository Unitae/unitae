import { describe, expect, it } from 'vitest'
import {
  type BuildingCheckFacts,
  buildingCheckReasons,
  buildingState,
  buildingWorkList,
  type CheckDates,
  checkDates,
  parseBuildingSort,
  parseBuildingView,
} from './building-list'
import { EntranceKind } from './entrance-kind.type'
import { TerritoryAccess } from './territory-access.type'

const NOW = new Date('2026-11-10T12:00:00Z')
const DATES: CheckDates = checkDates(24, NOW)
const LONG_AGO = new Date('2023-01-01T00:00:00Z')
const RECENTLY = new Date('2026-06-01T00:00:00Z')
const LAST_MONTH = new Date('2026-10-15T00:00:00Z')

function building(overrides: Partial<BuildingCheckFacts> = {}): BuildingCheckFacts {
  return {
    active: true,
    inTerritory: true,
    inOpenData: false,
    lastSeenInSourceAt: null,
    prospectionDate: RECENTLY,
    createdAt: LONG_AGO,
    entrances: [],
    ...overrides,
  }
}

function residential(overrides: Partial<BuildingCheckFacts['entrances'][number]> = {}) {
  return { kind: EntranceKind.Residential, access: null, homes: null, phones: null, isOpenEarly: null, ...overrides }
}

describe('checkDates', () => {
  it('turns the validity in months into the dates a prospection goes stale', () => {
    expect(DATES.staleDate?.toISOString()).toBe('2024-11-10T12:00:00.000Z')
    expect(DATES.inactiveStaleDate?.toISOString()).toBe('2022-11-10T12:00:00.000Z')
    expect(DATES.warningDate.toISOString()).toBe('2026-08-10T12:00:00.000Z')
  })

  it('never ages a prospection when no validity is set', () => {
    expect(checkDates(0, NOW)).toMatchObject({ staleDate: null, inactiveStaleDate: null })
  })
})

describe('buildingWorkList — every building in at most one work list', () => {
  it('a building the BANO listed and nobody has prospected yet is new', () => {
    expect(
      buildingWorkList(building({ inOpenData: true, lastSeenInSourceAt: RECENTLY, prospectionDate: null }), DATES),
    ).toBe('new')
  })

  it('a building the BANO listed before and no longer lists is missing, even never prospected', () => {
    expect(buildingWorkList(building({ lastSeenInSourceAt: LONG_AGO, prospectionDate: null }), DATES)).toBe('missing')
  })

  it('a building made by hand and never prospected is to check, never missing', () => {
    expect(buildingWorkList(building({ prospectionDate: null }), DATES)).toBe('check')
  })

  it('an up-to-date building is in no work list', () => {
    expect(buildingWorkList(building(), DATES)).toBeNull()
  })

  it('an inactive building is never new nor missing', () => {
    expect(
      buildingWorkList(
        building({ active: false, inOpenData: true, lastSeenInSourceAt: RECENTLY, prospectionDate: null }),
        DATES,
      ),
    ).toBeNull()
    expect(buildingWorkList(building({ active: false, lastSeenInSourceAt: LONG_AGO }), DATES)).toBeNull()
  })
})

describe('buildingCheckReasons', () => {
  it('says a prospection is too old', () => {
    expect(buildingCheckReasons(building({ prospectionDate: LONG_AGO }), DATES)).toEqual(['stale'])
  })

  it('says a building made by hand was never prospected', () => {
    expect(buildingCheckReasons(building({ prospectionDate: null }), DATES)).toEqual(['never-prospected'])
  })

  it('gives every reason, from every residential entrance', () => {
    const reasons = buildingCheckReasons(
      building({
        prospectionDate: LONG_AGO,
        entrances: [
          residential({ access: TerritoryAccess.Intercom, homes: null }),
          residential({ access: null, homes: 12 }),
          residential({ access: TerritoryAccess.Code, isOpenEarly: false, phones: null, homes: 4 }),
        ],
      }),
      DATES,
    )
    expect(reasons).toEqual(['stale', 'homes-missing', 'phones-missing', 'access-missing'])
  })

  it('needs a home count behind a doorbell, an intercom, or a code open early', () => {
    for (const entrance of [
      residential({ access: TerritoryAccess.Doorbell }),
      residential({ access: TerritoryAccess.Intercom }),
      residential({ access: TerritoryAccess.Code, isOpenEarly: true }),
    ]) {
      expect(buildingCheckReasons(building({ entrances: [entrance] }), DATES)).toEqual(['homes-missing'])
    }
  })

  it('ignores entrances that are not residential', () => {
    const shop = { ...residential({ access: null, homes: 3 }), kind: EntranceKind.Commerce }
    expect(buildingCheckReasons(building({ entrances: [shop] }), DATES)).toEqual([])
  })

  it('asks to reactivate an inactive building in the territory whose prospection is very old', () => {
    expect(buildingCheckReasons(building({ active: false, prospectionDate: new Date('2021-01-01') }), DATES)).toEqual([
      'reactivate',
    ])
    expect(buildingCheckReasons(building({ active: false, prospectionDate: LONG_AGO }), DATES)).toEqual([])
  })

  it('flags an active building outside the territory once it has been there a while', () => {
    expect(buildingCheckReasons(building({ inTerritory: false }), DATES)).toEqual(['outside-territory'])
    expect(buildingCheckReasons(building({ inTerritory: false, createdAt: LAST_MONTH }), DATES)).toEqual([])
  })

  it('leaves the entrance questions to buildings inside the territory', () => {
    const entrance = residential({ access: TerritoryAccess.Intercom })
    expect(
      buildingCheckReasons(building({ inTerritory: false, createdAt: LAST_MONTH, entrances: [entrance] }), DATES),
    ).toEqual([])
  })

  it('has nothing to say about a new or a missing building: they have their own list', () => {
    expect(
      buildingCheckReasons(building({ inOpenData: true, lastSeenInSourceAt: RECENTLY, prospectionDate: null }), DATES),
    ).toEqual([])
    expect(buildingCheckReasons(building({ lastSeenInSourceAt: LONG_AGO, prospectionDate: LONG_AGO }), DATES)).toEqual(
      [],
    )
  })

  it('never ages a prospection when no validity is set', () => {
    expect(buildingCheckReasons(building({ prospectionDate: LONG_AGO }), checkDates(0, NOW))).toEqual([])
  })
})

describe('buildingState', () => {
  it('is up to date, to prospect, or not worked', () => {
    expect(buildingState(building(), DATES)).toBe('done')
    expect(buildingState(building({ prospectionDate: LONG_AGO }), DATES)).toBe('todo')
    expect(buildingState(building({ prospectionDate: null }), DATES)).toBe('todo')
    expect(buildingState(building({ active: false }), DATES)).toBe('off')
    expect(buildingState(building({ inTerritory: false }), DATES)).toBe('off')
  })
})

describe('parseBuildingView / parseBuildingSort', () => {
  it('reads the view and the order from the address, with defaults', () => {
    expect(parseBuildingView(new URLSearchParams('view=missing'))).toBe('missing')
    expect(parseBuildingView(new URLSearchParams('view=nope'))).toBe('active')
    expect(parseBuildingView(new URLSearchParams())).toBe('active')
    expect(parseBuildingSort(new URLSearchParams('sort=oldest'))).toBe('oldest')
    expect(parseBuildingSort(new URLSearchParams('sort=nope'))).toBe('address')
  })
})
